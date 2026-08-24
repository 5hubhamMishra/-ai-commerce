import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, ProductStatus } from '@prisma/client';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductReviewDto } from './dto/create-product-review.dto';

type ProductReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string };
};

type ProductReviewDelegate = {
  findUnique(args: {
    where: {
      productId_orderId_userId: {
        productId: string;
        orderId: string;
        userId: string;
      };
    };
  }): Promise<{ id: string } | null>;
  create(args: {
    data: {
      productId: string;
      userId: string;
      orderId: string;
      rating: number;
      title?: string;
      body?: string;
    };
    include: { user: { select: { name: true } } };
  }): Promise<ProductReviewRow>;
  findMany(args: {
    where: { productId: string };
    include: { user: { select: { name: true } } };
    orderBy: { createdAt: 'desc' };
    skip: number;
    take: number;
  }): Promise<ProductReviewRow[]>;
  count(args: { where: { productId: string } }): Promise<number>;
  aggregate(args: {
    where: { productId: string };
    _avg: { rating: true };
    _count: { _all: true };
  }): Promise<{ _avg: { rating: number | null }; _count: { _all: number } }>;
};

@Injectable()
export class ProductReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: CatalogEventsService,
  ) {}

  async create(
    user: AuthenticatedUser,
    productSlug: string,
    dto: CreateProductReviewDto,
  ) {
    const product = await this.getActiveProductBySlug(productSlug);

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order || order.userId !== user.id) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }

    const hasProductItem = await this.prisma.orderItem.findFirst({
      where: {
        orderId: dto.orderId,
        variant: { productId: product.id },
      },
    });
    if (!hasProductItem) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_IN_ORDER',
        message: 'This product was not part of that order.',
      });
    }

    const deliveredEvent = await this.prisma.orderStateHistory.findFirst({
      where: { orderId: dto.orderId, toStatus: OrderStatus.DELIVERED },
    });
    if (!deliveredEvent) {
      throw new ConflictException({
        code: 'ORDER_NOT_DELIVERED',
        message: 'You can only review a product after your order is delivered.',
      });
    }

    const existing = await this.reviews.findUnique({
      where: {
        productId_orderId_userId: {
          productId: product.id,
          orderId: dto.orderId,
          userId: user.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'REVIEW_ALREADY_EXISTS',
        message: 'You have already reviewed this product for this order.',
      });
    }

    const review = await this.reviews.create({
      data: {
        productId: product.id,
        userId: user.id,
        orderId: dto.orderId,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
      },
      include: { user: { select: { name: true } } },
    });

    this.events.productChanged(product.id, 'updated');
    return toReviewResponse(review);
  }

  async listForProduct(productSlug: string, page = 1, pageSize = 20) {
    const product = await this.getActiveProductBySlug(productSlug);
    const where = { productId: product.id };

    const [rows, total, summary] = await Promise.all([
      this.reviews.findMany({
        where,
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.reviews.count({ where }),
      this.reviews.aggregate({
        where,
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    return {
      items: rows.map(toReviewResponse),
      total,
      page,
      pageSize,
      summary: {
        average: summary._avg.rating ?? null,
        count: summary._count._all,
      },
    };
  }

  private async getActiveProductBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found.',
      });
    }
    return product;
  }

  private get reviews(): ProductReviewDelegate {
    return (this.prisma as unknown as { productReview: ProductReviewDelegate })
      .productReview;
  }
}

function toReviewResponse(review: ProductReviewRow) {
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    authorName: review.user.name,
    verifiedPurchase: true,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

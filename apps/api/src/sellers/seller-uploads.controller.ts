import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { ProductsService } from '../products/products.service';
import { SellersService } from './sellers.service';
import { SELLER_ROLES } from './sellers.controller';

export async function decodeProductImage(file?: {
  buffer: Buffer;
  mimetype: string;
}) {
  if (
    !file ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ||
    file.buffer.length > 2 * 1024 * 1024
  ) {
    throw new BadRequestException(
      'Choose a JPEG, PNG or WebP image up to 2 MB.',
    );
  }
  try {
    const input = sharp(file.buffer, {
      limitInputPixels: 16_000_000,
      failOn: 'warning',
    });
    const metadata = await input.metadata();
    if (
      `image/${metadata.format === 'jpeg' ? 'jpeg' : metadata.format}` !==
        file.mimetype ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error('Invalid image');
    const content = await input
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    if (content.length > 2 * 1024 * 1024) throw new Error('Image too large');
    return content;
  } catch {
    throw new BadRequestException(
      'The image is invalid, animated, or exceeds 16 megapixels.',
    );
  }
}

@Controller()
export class SellerUploadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
    private readonly events: CatalogEventsService,
  ) {}

  @Roles(...SELLER_ROLES)
  @Post('sellers/me/products/:id/upload')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    const sellerId = await this.sellers.resolveSellerIdForUser(user.id);
    await this.sellers.assertVerifiedSeller(sellerId);
    const product = await this.prisma.product.findFirst({
      where: { id, sellerId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found.');
    const content = await decodeProductImage(file);
    const imageId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      // Serialize uploads per product so simultaneous requests cannot bypass the count limit.
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const owned = await tx.product.findFirst({
        where: {
          id,
          sellerId,
          deletedAt: null,
          seller: { status: 'VERIFIED' },
        },
      });
      if (!owned) throw new NotFoundException('Product not found.');
      const count = await tx.productImage.count({ where: { productId: id } });
      if (count >= 8)
        throw new BadRequestException('A product can have up to 8 images.');
      await tx.productImage.create({
        data: {
          id: imageId,
          productId: id,
          url: `/media/products/${imageId}.webp`,
          altText: product.name,
          sortOrder: count,
          isPrimary: count === 0,
          upload: { create: { content: new Uint8Array(content) } },
        },
      });
    });
    await this.audit.record({
      actorId: user.id,
      action: 'PRODUCT_IMAGE_CREATED',
      entityType: 'product_image',
      entityId: imageId,
      metadata: { productId: id },
    });
    this.events.productChanged(id, 'updated');
    return this.products.findByIdAdmin(id);
  }

  @Public()
  @Get('media/products/:id.webp')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(@Param('id', ParseUUIDPipe) id: string) {
    const upload = await this.prisma.productImageUpload.findUnique({
      where: { imageId: id },
      include: {
        image: {
          select: { product: { select: { status: true, deletedAt: true } } },
        },
      },
    });
    if (
      !upload ||
      upload.image.product.deletedAt ||
      upload.image.product.status !== 'ACTIVE'
    )
      throw new NotFoundException('Image not found.');
    return new StreamableFile(Buffer.from(upload.content), {
      type: 'image/webp',
      disposition: 'inline',
    });
  }

  @Roles(...SELLER_ROLES)
  @Get('sellers/me/products/:id/images/:imageId/preview')
  @Header('Cache-Control', 'no-store')
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    const sellerId = await this.sellers.resolveSellerIdForUser(user.id);
    const upload = await this.prisma.productImageUpload.findFirst({
      where: {
        imageId,
        image: { productId: id, product: { sellerId, deletedAt: null } },
      },
    });
    if (!upload) throw new NotFoundException('Image not found.');
    return {
      dataUrl: `data:image/webp;base64,${Buffer.from(upload.content).toString('base64')}`,
    };
  }
}

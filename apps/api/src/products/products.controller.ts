import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AssignTagDto } from './dto/assign-tag.dto';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { CreateSpecificationDto } from './dto/create-specification.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListProductReviewsQueryDto } from './dto/list-product-reviews-query.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateSpecificationDto } from './dto/update-specification.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductImagesService } from './product-images.service';
import { ProductReviewsService } from './product-reviews.service';
import { ProductSpecificationsService } from './product-specifications.service';
import { ProductTagsService } from './product-tags.service';
import { ProductVariantsService } from './product-variants.service';
import { ProductsService } from './products.service';

const CATALOG_WRITE_ROLES = [
  Role.CONTENT_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly variantsService: ProductVariantsService,
    private readonly imagesService: ProductImagesService,
    private readonly reviewsService: ProductReviewsService,
    private readonly specificationsService: ProductSpecificationsService,
    private readonly tagsService: ProductTagsService,
  ) {}

  // ---- Customer catalog ---------------------------------------------------

  @Public()
  @Get()
  list(@Query() query: ListProductsQueryDto) {
    return this.productsService.listPublic(query);
  }

  @Public()
  @Get('tags')
  listTags() {
    return this.tagsService.list();
  }

  // ---- Admin catalog --------------------------------------------------------
  // Registered before the ':slug' catch-all below so "admin" and "admin/:id"
  // are matched as literal segments rather than being swallowed as a slug.

  @Roles(...CATALOG_WRITE_ROLES)
  @Get('admin')
  adminList(@Query() query: ListProductsQueryDto) {
    return this.productsService.listAdmin(query);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Get('admin/:id')
  adminDetail(@Param('id') id: string) {
    return this.productsService.findByIdAdmin(id);
  }

  @Public()
  @Get(':slug/reviews')
  listReviews(
    @Param('slug') slug: string,
    @Query() query: ListProductReviewsQueryDto,
  ) {
    return this.reviewsService.listForProduct(
      slug,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Post(':slug/reviews')
  createReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: CreateProductReviewDto,
  ) {
    return this.reviewsService.create(user, slug, dto);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlugPublic(slug);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(dto, user.id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto, user.id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.remove(id, user.id);
  }

  // ---- Variants ---------------------------------------------------------

  @Roles(...CATALOG_WRITE_ROLES)
  @Post(':id/variants')
  addVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.variantsService.create(id, dto, user.id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Patch(':id/variants/:variantId')
  updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.variantsService.update(id, variantId, dto, user.id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id/variants/:variantId')
  removeVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.variantsService.remove(id, variantId, user.id);
  }

  // ---- Images -------------------------------------------------------------

  @Roles(...CATALOG_WRITE_ROLES)
  @Post(':id/images')
  addImage(@Param('id') id: string, @Body() dto: CreateImageDto) {
    return this.imagesService.create(id, dto);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Patch(':id/images/:imageId')
  updateImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateImageDto,
  ) {
    return this.imagesService.update(id, imageId, dto);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id/images/:imageId')
  removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.imagesService.remove(id, imageId);
  }

  // ---- Specifications -------------------------------------------------------

  @Roles(...CATALOG_WRITE_ROLES)
  @Post(':id/specifications')
  addSpecification(
    @Param('id') id: string,
    @Body() dto: CreateSpecificationDto,
  ) {
    return this.specificationsService.create(id, dto);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Patch(':id/specifications/:specId')
  updateSpecification(
    @Param('id') id: string,
    @Param('specId') specId: string,
    @Body() dto: UpdateSpecificationDto,
  ) {
    return this.specificationsService.update(id, specId, dto);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id/specifications/:specId')
  removeSpecification(
    @Param('id') id: string,
    @Param('specId') specId: string,
  ) {
    return this.specificationsService.remove(id, specId);
  }

  // ---- Tags ---------------------------------------------------------------

  @Roles(...CATALOG_WRITE_ROLES)
  @Post(':id/tags')
  assignTag(@Param('id') id: string, @Body() dto: AssignTagDto) {
    return this.tagsService.assign(id, dto.name);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id/tags/:tagId')
  removeTag(@Param('id') id: string, @Param('tagId') tagId: string) {
    return this.tagsService.remove(id, tagId);
  }
}

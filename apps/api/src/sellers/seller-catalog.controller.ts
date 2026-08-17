import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { SetInventoryDto } from '../inventory/dto/set-inventory.dto';
import { AssignTagDto } from '../products/dto/assign-tag.dto';
import { CreateImageDto } from '../products/dto/create-image.dto';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { CreateSpecificationDto } from '../products/dto/create-specification.dto';
import { CreateVariantDto } from '../products/dto/create-variant.dto';
import { ListProductsQueryDto } from '../products/dto/list-products-query.dto';
import { UpdateImageDto } from '../products/dto/update-image.dto';
import { UpdateProductDto } from '../products/dto/update-product.dto';
import { UpdateSpecificationDto } from '../products/dto/update-specification.dto';
import { UpdateVariantDto } from '../products/dto/update-variant.dto';
import { UpdateWarehouseDto } from '../warehouses/dto/update-warehouse.dto';
import { SELLER_ROLES } from './sellers.controller';
import { SellerCatalogService } from './seller-catalog.service';

/** A seller's own view of the catalog/inventory endpoints — same underlying
 *  services as /products, /inventory, /warehouses, scoped to whatever
 *  product/variant the caller's own seller account actually owns. */
@Roles(...SELLER_ROLES)
@Controller('sellers/me')
export class SellerCatalogController {
  constructor(private readonly catalog: SellerCatalogService) {}

  // ---- Products -------------------------------------------------------------

  @Get('products')
  listProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.catalog.listOwn(user.id, query);
  }

  @Get('products/:id')
  getProduct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.getOwn(user.id, id);
  }

  @Post('products')
  createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.catalog.create(user.id, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.update(user.id, id, dto);
  }

  @Delete('products/:id')
  removeProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.catalog.remove(user.id, id);
  }

  // ---- Variants ---------------------------------------------------------------

  @Post('products/:id/variants')
  addVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.catalog.addVariant(user.id, id, dto);
  }

  @Patch('products/:id/variants/:variantId')
  updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.catalog.updateVariant(user.id, id, variantId, dto);
  }

  @Delete('products/:id/variants/:variantId')
  removeVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.catalog.removeVariant(user.id, id, variantId);
  }

  // ---- Images / specifications / tags --------------------------------------------

  @Post('products/:id/images')
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateImageDto,
  ) {
    return this.catalog.addImage(user.id, id, dto);
  }

  @Patch('products/:id/images/:imageId')
  updateImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateImageDto,
  ) {
    return this.catalog.updateImage(user.id, id, imageId, dto);
  }

  @Delete('products/:id/images/:imageId')
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.catalog.removeImage(user.id, id, imageId);
  }

  @Post('products/:id/specifications')
  addSpecification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSpecificationDto,
  ) {
    return this.catalog.addSpecification(user.id, id, dto);
  }

  @Patch('products/:id/specifications/:specId')
  updateSpecification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('specId') specId: string,
    @Body() dto: UpdateSpecificationDto,
  ) {
    return this.catalog.updateSpecification(user.id, id, specId, dto);
  }

  @Delete('products/:id/specifications/:specId')
  removeSpecification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('specId') specId: string,
  ) {
    return this.catalog.removeSpecification(user.id, id, specId);
  }

  @Post('products/:id/tags')
  assignTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignTagDto,
  ) {
    return this.catalog.assignTag(user.id, id, dto);
  }

  @Delete('products/:id/tags/:tagId')
  removeTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    return this.catalog.removeTag(user.id, id, tagId);
  }

  // ---- Inventory ------------------------------------------------------------------

  @Get('inventory/variants/:variantId')
  getInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
  ) {
    return this.catalog.getInventory(user.id, variantId);
  }

  @Put('inventory/variants/:variantId')
  setInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: SetInventoryDto,
  ) {
    return this.catalog.setInventory(user.id, variantId, dto);
  }

  // ---- Own fulfillment warehouse ----------------------------------------------

  @Get('warehouse')
  getWarehouse(@CurrentUser() user: AuthenticatedUser) {
    return this.catalog.getWarehouse(user.id);
  }

  @Patch('warehouse')
  updateWarehouse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.catalog.updateWarehouse(user.id, dto);
  }
}

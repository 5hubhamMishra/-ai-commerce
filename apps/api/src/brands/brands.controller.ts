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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ListProductsQueryDto } from '../products/dto/list-products-query.dto';
import { ProductsService } from '../products/products.service';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

const CATALOG_WRITE_ROLES = [
  Role.CONTENT_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

@Controller('brands')
export class BrandsController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly productsService: ProductsService,
  ) {}

  @Public()
  @Get()
  list() {
    return this.brandsService.findActiveList();
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Get('admin')
  adminList(@Query() query: ListBrandsQueryDto) {
    return this.brandsService.adminList({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      includeInactive: query.includeInactive,
    });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.brandsService.findBySlug(slug, { activeOnly: true });
  }

  @Public()
  @Get(':slug/products')
  async productsInBrand(
    @Param('slug') slug: string,
    @Query() query: ListProductsQueryDto,
  ) {
    await this.brandsService.findBySlug(slug, { activeOnly: true });
    return this.productsService.listPublic({ ...query, brand: slug });
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto, user.id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brandsService.update(id, dto, user.id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.brandsService.remove(id, user.id);
  }
}

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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATALOG_WRITE_ROLES = [
  Role.CONTENT_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly productsService: ProductsService,
  ) {}

  @Public()
  @Get()
  tree() {
    return this.categoriesService.findActiveTree();
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Get('admin')
  adminList(@Query() query: ListCategoriesQueryDto) {
    return this.categoriesService.adminList({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      includeInactive: query.includeInactive,
    });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug, { activeOnly: true });
  }

  @Public()
  @Get(':slug/products')
  async productsInCategory(
    @Param('slug') slug: string,
    @Query() query: ListProductsQueryDto,
  ) {
    await this.categoriesService.findBySlug(slug, { activeOnly: true });
    return this.productsService.listPublic({ ...query, category: slug });
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(dto, user.id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto, user.id);
  }

  @Roles(...CATALOG_WRITE_ROLES)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.categoriesService.remove(id, user.id);
  }
}

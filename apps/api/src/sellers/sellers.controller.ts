import {
  Body,
  Controller,
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
import { ApplySellerDto } from './dto/apply-seller.dto';
import { ListSellersQueryDto } from './dto/list-sellers-query.dto';
import { RejectSellerDto } from './dto/reject-seller.dto';
import { SuspendSellerDto } from './dto/suspend-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';
import { SellersService } from './sellers.service';

export const SELLER_ROLES = [Role.SELLER, Role.SELLER_STAFF];
const ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN];

@Controller('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  // ---- Onboarding / own account (any authenticated user can apply) --------

  @Post('apply')
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplySellerDto) {
    return this.sellersService.apply(user.id, dto);
  }

  @Roles(...SELLER_ROLES)
  @Get('me')
  getOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.sellersService.getOwn(user.id);
  }

  @Roles(...SELLER_ROLES)
  @Patch('me')
  updateOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSellerDto,
  ) {
    return this.sellersService.updateOwn(user.id, dto);
  }

  // ---- Admin (registered before the public :slug catch-all) ---------------

  @Roles(...ADMIN_ROLES)
  @Get('admin')
  listAdmin(@Query() query: ListSellersQueryDto) {
    return this.sellersService.listAdmin(query);
  }

  @Roles(...ADMIN_ROLES)
  @Get('admin/:id')
  getAdminDetail(@Param('id') id: string) {
    return this.sellersService.getAdminDetail(id);
  }

  @Roles(...ADMIN_ROLES)
  @Patch('admin/:id/verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sellersService.verify(user.id, id);
  }

  @Roles(...ADMIN_ROLES)
  @Patch('admin/:id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectSellerDto,
  ) {
    return this.sellersService.reject(user.id, id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Patch('admin/:id/suspend')
  suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuspendSellerDto,
  ) {
    return this.sellersService.suspend(user.id, id, dto);
  }

  @Roles(...ADMIN_ROLES)
  @Patch('admin/:id/reinstate')
  reinstate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sellersService.reinstate(user.id, id);
  }

  // ---- Public storefront ----------------------------------------------------

  @Public()
  @Get(':slug')
  getPublicBySlug(@Param('slug') slug: string) {
    return this.sellersService.getPublicBySlug(slug);
  }

  @Public()
  @Get(':slug/products')
  listPublicProducts(
    @Param('slug') slug: string,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.sellersService.listPublicProducts(slug, query);
  }
}

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateRatingDto } from './dto/create-rating.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { SellerRatingsService } from './seller-ratings.service';

@Controller('sellers/:id/ratings')
export class SellerRatingsController {
  constructor(private readonly ratings: SellerRatingsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratings.create(user, id, dto);
  }

  @Public()
  @Get()
  list(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.ratings.listForSeller(
      id,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }
}

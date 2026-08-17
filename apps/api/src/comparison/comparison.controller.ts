import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ComparisonService } from './comparison.service';
import { ComparisonQueryDto } from './dto/comparison-query.dto';

@Controller('comparison')
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  @Public()
  @Get()
  compare(@Query() query: ComparisonQueryDto) {
    return this.comparisonService.compare(query.ids);
  }
}

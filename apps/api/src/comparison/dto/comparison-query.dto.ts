import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsUUID,
} from 'class-validator';

const MAX_COMPARE_ITEMS = 4;

function toIdArray({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.split(',').filter(Boolean) : value;
}

export class ComparisonQueryDto {
  @Transform(toIdArray)
  @IsUUID('4', { each: true })
  @ArrayUnique()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_COMPARE_ITEMS)
  ids!: string[];
}

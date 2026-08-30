import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, validateSync } from 'class-validator';
import { parseBooleanQueryParam } from './query-transformers';

class BooleanQueryDto {
  @Transform(({ value }) => parseBooleanQueryParam(value))
  @IsBoolean()
  value!: boolean;
}

describe('parseBooleanQueryParam', () => {
  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('converts %p to %p', (input, expected) => {
    expect(parseBooleanQueryParam(input)).toBe(expected);
  });

  it('leaves invalid values for validation to reject', () => {
    const dto = plainToInstance(BooleanQueryDto, { value: 'maybe' });

    expect(validateSync(dto)).not.toHaveLength(0);
  });
});

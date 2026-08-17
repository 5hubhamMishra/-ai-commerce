import { IsUUID } from 'class-validator';

export class ShippingQuoteQueryDto {
  @IsUUID()
  addressId!: string;
}

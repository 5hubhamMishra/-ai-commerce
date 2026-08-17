import { IsIn, IsUUID } from 'class-validator';

export const SHIPPING_METHODS = ['STANDARD', 'EXPRESS'] as const;

export class CreateOrderDto {
  @IsUUID()
  addressId!: string;

  @IsIn(SHIPPING_METHODS)
  shippingMethod!: (typeof SHIPPING_METHODS)[number];
}

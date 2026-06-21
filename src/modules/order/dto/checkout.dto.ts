import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CheckoutDto {
  @IsString()
  @IsNotEmpty()
  deliveryAddressId!: string;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;
}

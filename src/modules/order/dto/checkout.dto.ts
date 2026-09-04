import { IsEnum, IsNotEmpty } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { DeliveryAddressSelectionDto } from './delivery-address-selection.dto';

export class CheckoutDto extends DeliveryAddressSelectionDto {
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;
}

import { ArrayNotEmpty, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { DeliveryAddressSelectionDto } from './delivery-address-selection.dto';

export class CheckoutDto extends DeliveryAddressSelectionDto {
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;

  /// Item keranjang yang ikut dipesan. Dihilangkan berarti seluruh keranjang —
  /// perilaku lama tetap berlaku bagi klien yang belum mengirim daftar ini.
  /// Item yang tidak disebut tetap tinggal di keranjang setelah checkout.
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsOptional()
  cartItemIds?: string[];
}

import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { FulfillmentMethod, PaymentMethod } from '@prisma/client';
import { DeliveryAddressSelectionDto } from './delivery-address-selection.dto';

export class CheckoutDto extends DeliveryAddressSelectionDto {
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;

  /// Cara menerima barang. Bawaannya pengantaran, sama dengan kolomnya di
  /// basis data, supaya klien lama yang belum mengirim field ini tetap
  /// menghasilkan pesanan yang sama seperti sebelumnya.
  @IsEnum(FulfillmentMethod)
  @IsOptional()
  fulfillment?: FulfillmentMethod;

  /// Item keranjang yang ikut dipesan. Dihilangkan berarti seluruh keranjang —
  /// perilaku lama tetap berlaku bagi klien yang belum mengirim daftar ini.
  /// Item yang tidak disebut tetap tinggal di keranjang setelah checkout.
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsOptional()
  cartItemIds?: string[];
}

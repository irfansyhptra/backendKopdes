import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FulfillmentMethod, PaymentMethod } from '@prisma/client';
import { DeliveryAddressSelectionDto } from './delivery-address-selection.dto';

export class CreateOrderItemDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  umkmProductId?: string;

  /// Varian yang dipilih. Kosong pada produk tanpa varian.
  @IsString()
  @IsOptional()
  variantId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto extends DeliveryAddressSelectionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;

  /// Cara menerima barang. Bawaannya pengantaran, sama dengan kolomnya di
  /// basis data, supaya klien lama yang belum mengirim field ini tetap
  /// menghasilkan pesanan yang sama seperti sebelumnya.
  @IsEnum(FulfillmentMethod)
  @IsOptional()
  fulfillment?: FulfillmentMethod;
}

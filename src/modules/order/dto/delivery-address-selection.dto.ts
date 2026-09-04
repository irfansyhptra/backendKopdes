import { IsOptional, IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAddressDto } from '../../address/dto/address.dto';

/**
 * Cara pemesan menentukan alamat pengiriman, dipakai bersama oleh checkout
 * dan pemesanan langsung. Tiga kemungkinan:
 *
 *  1. Keduanya kosong  → pakai alamat utama yang disetel di profil.
 *  2. deliveryAddressId → pilih salah satu alamat tersimpan.
 *  3. deliveryAddress   → alamat baru yang diketik saat checkout; ikut
 *                         tersimpan ke buku alamat, tapi tidak menggeser
 *                         alamat utama kecuali diminta lewat isDefault.
 */
export class DeliveryAddressSelectionDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  deliveryAddressId?: string;

  @ValidateNested()
  @Type(() => CreateAddressDto)
  @IsOptional()
  deliveryAddress?: CreateAddressDto;
}

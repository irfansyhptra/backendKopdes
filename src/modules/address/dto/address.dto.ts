import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Titik rumah, dari tombol "Gunakan lokasi saya" di form alamat.
 *
 * Opsional di kedua DTO: izin lokasi boleh ditolak, dan alamat tanpa titik
 * tetap bisa diantar — kurir membaca teks alamatnya.
 */
class AddressPoint {
  @Type(() => Number)
  @IsLatitude({ message: 'Koordinat lintang tidak sah.' })
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsLongitude({ message: 'Koordinat bujur tidak sah.' })
  @IsOptional()
  longitude?: number;
}

export class CreateAddressDto extends AddressPoint {
  // Label yang dipilih pengguna, mis. "Rumah", "Warung".
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  recipientName!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  street!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateAddressDto extends AddressPoint {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  recipientName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  street?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  city?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  state?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  postalCode?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

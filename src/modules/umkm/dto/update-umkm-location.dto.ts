import { Type } from 'class-transformer';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { UMKMCategory } from '@prisma/client';

/**
 * Data lokasi & profil Mitra UMKM yang diisi Admin Kopdes.
 *
 * Tanpa koordinat, sebuah UMKM tidak akan pernah muncul di hasil pencarian
 * terdekat — form ini yang mengisinya. Semua field opsional supaya admin bisa
 * memperbarui sebagian saja.
 */
export class UpdateUmkmLocationDto {
  @Type(() => Number)
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @IsEnum(UMKMCategory)
  @IsOptional()
  category?: UMKMCategory;

  @IsUrl()
  @IsOptional()
  photoUrl?: string;

  /// Bentuk: { "mon": { "open": "07:00", "close": "17:00" }, "sun": null }
  @IsObject()
  @IsOptional()
  operatingHours?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  kopdesId?: string;
}

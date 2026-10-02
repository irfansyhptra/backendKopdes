import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { UMKMCategory } from '@prisma/client';

/**
 * Daftar Mitra UMKM tanpa konteks lokasi.
 *
 * Dipakai halaman "Mitra Kopdes": yang dicari adalah mitra yang bernaung di
 * bawah satu koperasi, bukan yang terdekat dari pembuka halaman — jadi
 * koordinat tidak diminta sama sekali.
 */
export class MitraListQueryDto {
  /// Koperasi tempat mitra bernaung. Tanpa ini, seluruh mitra aktif terdaftar.
  @IsString()
  @IsOptional()
  kopdesId?: string;

  @IsEnum(UMKMCategory)
  @IsOptional()
  category?: UMKMCategory;

  @IsString()
  @IsOptional()
  search?: string;

  /// Koordinat pembaca. Opsional dan TIDAK menyaring — hanya mengurutkan.
  /// `nearby` yang menyaring dalam radius; yang ini daftar lengkap.
  @Type(() => Number)
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsLongitude()
  @IsOptional()
  longitude?: number;

  /// Hanya mitra yang benar-benar punya barang untuk dijual.
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  withProductsOnly?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 20;
}

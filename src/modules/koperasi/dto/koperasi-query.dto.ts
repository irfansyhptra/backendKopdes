import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/// Daftar Kopdes.
///
/// Koordinatnya opsional dan TIDAK menyaring: ia hanya mengurutkan. Endpoint
/// `nearby` yang menyaring dalam radius; yang ini menampilkan seluruh Kopdes
/// aktif, terdekat lebih dulu bila lokasinya diketahui.
///
/// Pemisahan ini yang dulu hilang: beranda memakai `nearby` dengan radius
/// 10 km, sehingga desa yang lebih jauh — dan di banyak kabupaten itu berarti
/// hampir semuanya — terbaca sebagai "tidak ada Kopdes".
export class KoperasiQueryDto {
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
  limit?: number = 10;

  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsLongitude()
  @IsOptional()
  longitude?: number;

  /// Hanya Kopdes yang benar-benar punya barang untuk dijual.
  ///
  /// Etalase kosong membuat orang mengira aplikasinya rusak; lebih baik
  /// Kopdes itu belum muncul sampai barang pertamanya diunggah.
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  withProductsOnly?: boolean;
}

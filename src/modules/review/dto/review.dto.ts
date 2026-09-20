import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Sasaran ulasan. Tepat satu yang boleh terisi — dipastikan service, karena
 * class-validator tidak memeriksa hubungan antar-field.
 */
export class CreateReviewDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  umkmProductId?: string;

  @IsString()
  @IsOptional()
  koperasiId?: string;

  @IsString()
  @IsOptional()
  umkmId?: string;

  /// Pesanan yang menjadi dasar ulasan. Wajib untuk ulasan produk: tanpa itu
  /// siapa pun bisa menilai barang yang tidak pernah ia beli.
  @IsString()
  @IsOptional()
  orderId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  comment?: string;
}

export class ListReviewQueryDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  umkmProductId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}

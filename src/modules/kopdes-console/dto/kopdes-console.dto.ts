import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Profil Kopdes yang boleh diubah pengurusnya sendiri. Wilayah (desa,
 * kecamatan, kota, provinsi) dan titik peta tidak termasuk: "satu desa satu
 * Kopdes" dijaga Super Admin, bukan pengurus.
 */
export class UpdateKopdesProfileDto {
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  @IsOptional()
  name?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @Transform(trim)
  @IsString()
  @Length(5, 200)
  @IsOptional()
  address?: string;

  /** Ponsel atau telepon kantor: 8–15 digit, boleh diawali +62. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  )
  @IsString()
  @Matches(/^(\+62|0)\d{7,13}$/, {
    message: 'Nomor telepon tidak valid, mis. 0651xxxxxx atau 0812xxxxxxx.',
  })
  @IsOptional()
  phone?: string;

  @Transform(trim)
  @IsString()
  @Matches(/^\d{5}$/, { message: 'Kode pos 5 digit angka.' })
  @IsOptional()
  postalCode?: string;

  /** Bentuknya diperiksa di service lewat `normalizeOperatingHours`. */
  @IsObject()
  @IsOptional()
  operatingHours?: Record<string, unknown>;
}

export class KopdesProductQueryDto {
  @Transform(trim)
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsIn(['safe', 'low', 'out'])
  @IsOptional()
  stockStatus?: 'safe' | 'low' | 'out';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

/** Penyaring catatan uang masuk dari penjualan mitra. */
export class MitraIncomeQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

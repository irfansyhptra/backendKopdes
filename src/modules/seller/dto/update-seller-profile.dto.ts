import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UMKMCategory } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateSellerProfileDto {
  @Transform(trim)
  @IsString()
  @Length(3, 100)
  @IsOptional()
  businessName?: string;

  /** Boleh kosong: ringkasan toko menampilkan "Lengkapi informasi". */
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  description?: string;

  @Transform(trim)
  @IsString()
  @Length(5, 200)
  @IsOptional()
  address?: string;

  /** Nomor ponsel Indonesia: 08…, 628…, atau +628…, 10–15 digit. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  )
  @IsString()
  @Matches(/^(\+62|62|0)8\d{7,12}$/, {
    message: 'Nomor telepon harus nomor ponsel Indonesia, mis. 0812xxxxxxx.',
  })
  @IsOptional()
  phone?: string;

  @IsEnum(UMKMCategory)
  @IsOptional()
  category?: UMKMCategory;

  /** Bentuknya diperiksa di service lewat `normalizeOperatingHours`. */
  @IsObject()
  @IsOptional()
  operatingHours?: Record<string, unknown>;
}

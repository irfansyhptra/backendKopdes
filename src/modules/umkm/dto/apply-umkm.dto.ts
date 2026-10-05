import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { UMKMCategory } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Pengajuan menjadi mitra UMKM — aturan sama dengan profil penjual. */
export class ApplyUmkmDto {
  @Transform(trim)
  @IsString()
  @Length(3, 100)
  businessName!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  description?: string;

  @Transform(trim)
  @IsString()
  @Length(5, 200)
  address!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  )
  @IsString()
  @Matches(/^(\+62|62|0)8\d{7,12}$/, {
    message: 'Nomor telepon harus nomor ponsel Indonesia, mis. 0812xxxxxxx.',
  })
  phone!: string;

  @IsEnum(UMKMCategory)
  category!: UMKMCategory;

  /** Kopdes desa tempat usaha berada. */
  @IsUUID()
  kopdesId!: string;

  /** Titik usaha dari GPS ponsel — bahan pengurus memeriksa "sedesa". */
  @Type(() => Number)
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsLongitude()
  @IsOptional()
  longitude?: number;
}

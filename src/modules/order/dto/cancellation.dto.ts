import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Pengajuan pembatalan oleh pemesan. */
export class RequestCancellationDto {
  /**
   * Alasannya wajib. Toko yang memutuskan, dan ia tidak bisa memutuskan
   * apa pun dari pengajuan kosong.
   */
  @Transform(trim)
  @IsString()
  @Length(5, 300, {
    message: 'Tulis alasan pembatalan, 5–300 huruf.',
  })
  reason!: string;
}

/** Keputusan toko atas sebuah pengajuan. */
export class DecideCancellationDto {
  @IsBoolean()
  approve!: boolean;

  @Transform(trim)
  @IsString()
  @MaxLength(300)
  @IsOptional()
  reason?: string;
}

export class CancellationListQueryDto {
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

import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Titik GPS kurir. Dikirim saat mengirim posisi dan saat menandai tiba. */
export class CourierPointDto {
  @Type(() => Number)
  @IsLatitude({ message: 'Koordinat lintang tidak sah.' })
  latitude!: number;

  @Type(() => Number)
  @IsLongitude({ message: 'Koordinat bujur tidak sah.' })
  longitude!: number;
}

/**
 * Posisi kurir saat menandai barang sudah diantar.
 *
 * Opsional: GPS bisa mati atau tidak dapat sinyal di dalam rumah, dan
 * menolak penandaan karena itu akan membuat kurir terjebak di depan pintu
 * dengan pesanan yang tidak bisa diselesaikan.
 */
export class MarkDeliveredDto {
  @Type(() => Number)
  @IsLatitude({ message: 'Koordinat lintang tidak sah.' })
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsLongitude({ message: 'Koordinat bujur tidak sah.' })
  @IsOptional()
  longitude?: number;
}

export class ReleaseTaskDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  reason?: string;
}

export class CourierHistoryQueryDto {
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

import {
  ArrayMaxSize,
  IsArray,
  IsUrl,
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/** multipart/form-data mengirim boolean sebagai string; normalkan dulu. */
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export class UpdateProductDto {
  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  price?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPrice?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  unit?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  sku?: string;

  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  isPreOrderAllowed?: boolean;

  @IsDateString()
  @IsOptional()
  preOrderAvailableAt?: string;

  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Gambar baru yang sudah diunggah klien; lihat CreateProductDto. */
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  @IsOptional()
  imageUrls?: string[];

  /**
   * URL gambar lama yang tetap dipertahankan.
   *
   * Dikirim berarti daftar gambar diganti seluruhnya oleh gabungan
   * `keepImageUrls` + `imageUrls`; tidak dikirim berarti gambar lama
   * dibiarkan apa adanya. Tanpa pembedaan ini, menyunting harga saja akan
   * menghapus seluruh gambar barang.
   */
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  @IsOptional()
  keepImageUrls?: string[];
}

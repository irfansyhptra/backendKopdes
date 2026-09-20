import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/**
 * Field form "Input Barang" milik staf Kopdes.
 *
 * Batasan di sini bukan salinan validasi Flutter melainkan penjaga
 * sesungguhnya: form bisa dilewati, request ke `/products` tidak.
 */
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  price!: number;

  /// Harga coret. Wajib lebih kecil dari `price` — dicek di service karena
  /// class-validator tidak membandingkan antar-field.
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPrice?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;

  /// Ambang pesan ulang; dipakai KPI "Stok Menipis".
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;

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

  /**
   * Gambar yang sudah diunggah klien ke penyimpanan luar (Cloudinary).
   *
   * Jalur ini ada karena berkasnya tidak perlu melewati server: fungsi
   * serverless di Vercel membatasi badan permintaan pada 4,5 MB, sementara
   * satu foto ponsel saja sering melampauinya. Klien mengunggah langsung,
   * lalu mengirim URL-nya ke sini.
   *
   * `images` (multipart) tetap diterima untuk klien lama.
   *
   * Hanya URL https yang diterima. Tanpa itu, seseorang bisa menitipkan
   * `javascript:` atau tautan ke host mana pun dan itulah yang akan dirender
   * halaman katalog.
   */
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  @IsOptional()
  imageUrls?: string[];

  /** Dikirim saat menyunting: URL gambar lama yang tetap dipertahankan. */
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  @IsOptional()
  keepImageUrls?: string[];
}

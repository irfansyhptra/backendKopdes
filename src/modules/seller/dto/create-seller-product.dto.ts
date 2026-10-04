import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  Length,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PRODUCT_RULES as R } from './product-rules';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSellerProductDto {
  @Transform(trim)
  @IsString()
  @Length(R.nameMin, R.nameMax)
  name!: string;

  // Opsional: deskripsi kosong lebih baik daripada produk yang ditolak
  // karena penjual belum sempat menulisnya.
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(R.descriptionMax)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(R.priceMin)
  @Max(R.priceMax)
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(R.stockMax)
  stock!: number;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;
}

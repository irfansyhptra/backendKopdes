import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  Length,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PRODUCT_RULES as R } from './product-rules';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateSellerProductDto {
  @Transform(trim)
  @IsString()
  @IsOptional()
  @Length(R.nameMin, R.nameMax)
  name?: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(R.descriptionMax)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(R.priceMin)
  @Max(R.priceMax)
  price?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(R.stockMax)
  stock?: number;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

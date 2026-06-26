import { IsString, IsOptional, IsNumber, IsInt, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UpdateSellerProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  price?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
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

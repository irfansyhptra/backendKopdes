import { IsString, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCartItemDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  umkmProductId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

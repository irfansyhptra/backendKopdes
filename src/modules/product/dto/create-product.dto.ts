import { IsString, IsNotEmpty, IsNumber, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @Type(() => Number)
  @IsNumber()
  price!: number;

  @Type(() => Number)
  @IsInt()
  stock!: number;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;
}

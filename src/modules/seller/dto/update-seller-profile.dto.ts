import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateSellerProfileDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  address?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  phone?: string;
}

import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UMKMStatus } from '@prisma/client';

export class ListUmkmQueryDto {
  @IsOptional()
  @IsEnum(UMKMStatus)
  status?: UMKMStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ListUmkmProductQueryDto {
  @IsOptional()
  @IsString()
  umkmId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

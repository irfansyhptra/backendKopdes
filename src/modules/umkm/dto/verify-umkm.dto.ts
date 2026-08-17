import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UMKMStatus } from '@prisma/client';

// Admin Kopdes memutuskan status kemitraan UMKM.
export class VerifyUmkmDto {
  @IsEnum(UMKMStatus)
  status!: UMKMStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

import { IsEnum, IsOptional } from 'class-validator';
import { UMKMCategory } from '@prisma/client';

import { NearbyQueryDto } from '../../koperasi/dto/nearby-query.dto';

/// Pencarian Mitra UMKM terdekat, dengan filter kategori usaha.
export class MitraNearbyQueryDto extends NearbyQueryDto {
  @IsEnum(UMKMCategory)
  @IsOptional()
  category?: UMKMCategory;
}

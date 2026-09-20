import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { MAX_RADIUS_KM } from '../../../common/geo/geo.util';

/// Sumber produk yang ditampilkan Marketplace.
export const SELLER_TYPES = ['ALL', 'KOPDES', 'UMKM'] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

export const SORTS = ['newest', 'price_asc', 'price_desc', 'distance'] as const;
export type MarketplaceSort = (typeof SORTS)[number];

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export class MarketplaceQueryDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsIn(SELLER_TYPES)
  @IsOptional()
  sellerType?: SellerType = 'ALL';

  @IsIn(SORTS)
  @IsOptional()
  sort?: MarketplaceSort = 'newest';

  /// Wajib berpasangan bila sort = 'distance'.
  @Type(() => Number)
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(MAX_RADIUS_KM)
  @IsOptional()
  radius?: number = 25;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  minPrice?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxPrice?: number;

  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  inStock?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 20;
}

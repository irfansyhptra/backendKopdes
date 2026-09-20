import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { PERIODS, type Period } from '../period';

export { PERIODS, PERIOD_DAYS, type Period } from '../period';

export class BestSellersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 10;

  @IsIn(PERIODS)
  @IsOptional()
  period?: Period = '30d';
}

export class FeaturedQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 10;
}

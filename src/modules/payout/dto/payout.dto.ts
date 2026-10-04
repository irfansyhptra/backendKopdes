import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpsertBankAccountDto {
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  bankName!: string;

  /** Hanya angka: spasi dan tanda hubung dibuang sebelum diperiksa. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{6,20}$/, {
    message: 'Nomor rekening harus 6–20 digit angka.',
  })
  accountNumber!: string;

  @Transform(trim)
  @IsString()
  @Length(3, 80)
  accountHolder!: string;
}

export class RequestPayoutDto {
  /** Rupiah bulat — transfer bank tidak mengenal sen. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount!: number;
}

export class ListPayoutsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;

  @IsIn(['REQUESTED', 'PAID', 'REJECTED'])
  @IsOptional()
  status?: 'REQUESTED' | 'PAID' | 'REJECTED';
}

export class MarkPayoutPaidDto {
  @Transform(trim)
  @IsString()
  @Length(3, 80)
  transferRef!: string;
}

export class RejectPayoutDto {
  @Transform(trim)
  @IsString()
  @Length(5, 300)
  reason!: string;
}

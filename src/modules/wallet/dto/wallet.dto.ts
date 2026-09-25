import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Metode yang boleh dipakai untuk isi ulang.
 *
 * COD tidak ada di sini dengan sengaja: "bayar di tempat" tidak berarti
 * apa-apa untuk mengisi saldo — tidak ada barang yang diantar dan tidak ada
 * momen serah terima uangnya.
 */
export const TOPUP_METHODS = [
  PaymentMethod.QRIS,
  PaymentMethod.GOPAY,
  PaymentMethod.SHOPEEPAY,
  PaymentMethod.BCA_VA,
  PaymentMethod.BNI_VA,
  PaymentMethod.BRI_VA,
  PaymentMethod.PERMATA_VA,
  PaymentMethod.MANDIRI_BILL,
] as const;

export class CreateTopUpDto {
  /// Rupiah bulat. Batasnya diperiksa lagi di service, karena DTO hanya
  /// berlaku pada permintaan HTTP — pemanggil internal melewatinya.
  @Type(() => Number)
  @IsInt()
  @Min(10_000)
  @Max(10_000_000)
  amount!: number;

  @IsIn(TOPUP_METHODS)
  paymentMethod!: (typeof TOPUP_METHODS)[number];
}

export class WalletEntryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

/**
 * Koreksi manual Super Admin.
 *
 * Alasan wajib: saldo yang berubah tanpa penjelasan tidak bisa
 * dipertanggungjawabkan saat audit, dan inilah satu-satunya jalur yang bisa
 * menambah saldo tanpa uang masuk.
 */
export class AdjustWalletDto {
  @IsString()
  userId!: string;

  @Type(() => Number)
  @IsInt()
  amount!: number;

  @IsString()
  @Length(5, 300)
  reason!: string;
}

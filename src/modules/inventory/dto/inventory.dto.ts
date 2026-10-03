import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryTransactionType } from '@prisma/client';

// Referensi ke satu produk — Kopdes (productId) atau mitra (umkmProductId).
// Service memastikan tepat satu yang terisi.
export class ProductRefDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  umkmProductId?: string;
}

export class ListTransactionsQueryDto extends ProductRefDto {
  @IsEnum(InventoryTransactionType)
  @IsOptional()
  type?: InventoryTransactionType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}

// Penyesuaian manual: barang masuk, barang keluar, atau koreksi.
export class AdjustStockDto extends ProductRefDto {
  @IsEnum(InventoryTransactionType)
  @IsNotEmpty()
  type!: InventoryTransactionType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

// Stok opname: kirim hasil hitung fisik, sistem menghitung selisihnya sendiri.
export class StockOpnameDto extends ProductRefDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedStock!: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

/**
 * Satu pergerakan stok dari kasir POS.
 *
 * Bedanya dengan [AdjustStockDto] cuma satu: `externalRef` wajib. Kasir
 * berjalan di jaringan desa yang putus-nyambung dan akan mengirim ulang
 * permintaan yang jawabannya tidak sampai; nomor struk membuat kiriman kedua
 * dikenali sebagai permintaan yang sama, bukan penjualan kedua.
 */
export class PosMovementDto extends AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  externalRef!: string;
}

/// Pemantauan stok: ambil yang terjadi setelah penanda waktu terakhir.
export class LiveFeedQueryDto {
  /// Penanda dari respons sebelumnya. Kosong = ambil yang terbaru.
  ///
  /// Nilainya `serverTime` milik server, bukan jam perangkat: kasir dan
  /// ponsel pemilik toko tidak pernah benar-benar sinkron, dan selisih
  /// beberapa detik saja sudah cukup untuk melewatkan atau mengulang baris.
  @IsISO8601()
  @IsOptional()
  since?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}

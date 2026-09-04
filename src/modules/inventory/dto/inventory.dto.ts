import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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

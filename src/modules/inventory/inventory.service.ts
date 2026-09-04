import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import {
  AdjustStockDto,
  ListTransactionsQueryDto,
  ProductRefDto,
  StockOpnameDto,
} from './dto/inventory.dto';

// Satu produk, apa pun jenisnya, setelah divalidasi.
type ResolvedProduct = {
  kind: 'KOPDES' | 'UMKM';
  id: string;
  name: string;
  stock: number;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Memastikan referensi produk sah dan — bila pemanggilnya mitra UMKM —
   * memastikan produk itu memang miliknya.
   *
   * `umkmId` null berarti pemanggilnya staf Kopdes: boleh menyentuh keduanya.
   */
  private async resolveProduct(
    ref: ProductRefDto,
    umkmId: string | null,
  ): Promise<ResolvedProduct> {
    if (!!ref.productId === !!ref.umkmProductId) {
      throw new BadRequestException(
        'Isi tepat satu dari productId atau umkmProductId',
      );
    }

    if (ref.productId) {
      if (umkmId) {
        throw new ForbiddenException(
          'Mitra UMKM hanya boleh mengelola stok produknya sendiri',
        );
      }
      const product = await this.prisma.product.findUnique({
        where: { id: ref.productId },
        select: { id: true, name: true, stock: true },
      });
      if (!product) {
        throw new NotFoundException('Produk tidak ditemukan');
      }
      return { kind: 'KOPDES', ...product };
    }

    const umkmProduct = await this.prisma.uMKMProduct.findUnique({
      where: { id: ref.umkmProductId },
      select: { id: true, name: true, stock: true, umkmId: true },
    });
    if (!umkmProduct) {
      throw new NotFoundException('Produk UMKM tidak ditemukan');
    }
    if (umkmId && umkmProduct.umkmId !== umkmId) {
      throw new ForbiddenException('Produk ini bukan milik toko Anda');
    }
    return {
      kind: 'UMKM',
      id: umkmProduct.id,
      name: umkmProduct.name,
      stock: umkmProduct.stock,
    };
  }

  private async getUmkmIdOrThrow(userId: string): Promise<string> {
    const umkm = await this.prisma.uMKM.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!umkm) {
      throw new NotFoundException('Profil UMKM tidak ditemukan untuk akun ini');
    }
    return umkm.id;
  }

  /** Riwayat pergerakan stok, terbaru dulu. */
  async listTransactions(query: ListTransactionsQueryDto, umkmId: string | null) {
    const where: Prisma.InventoryTransactionWhereInput = {};

    if (query.productId || query.umkmProductId) {
      const product = await this.resolveProduct(query, umkmId);
      if (product.kind === 'KOPDES') {
        where.productId = product.id;
      } else {
        where.umkmProductId = product.id;
      }
    } else if (umkmId) {
      // Mitra tanpa filter produk hanya melihat riwayat seluruh produknya sendiri.
      where.umkmProduct = { umkmId };
    }

    if (query.type) {
      where.type = query.type;
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);

    const [items, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where,
        include: {
          product: { select: { id: true, name: true } },
          umkmProduct: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** Penyesuaian manual: barang masuk, barang keluar, atau koreksi. */
  async adjustStock(userId: string, dto: AdjustStockDto, umkmId: string | null) {
    const product = await this.resolveProduct(dto, umkmId);

    const delta =
      dto.type === InventoryTransactionType.OUT ? -dto.quantity : dto.quantity;
    const newStock = product.stock + delta;

    if (newStock < 0) {
      throw new BadRequestException(
        `Stok "${product.name}" tidak mencukupi: tersisa ${product.stock}, diminta keluar ${dto.quantity}`,
      );
    }

    return this.writeMovement(userId, product, {
      type: dto.type,
      quantity: dto.quantity,
      newStock,
      reason: dto.reason,
    });
  }

  /**
   * Stok opname: stok di-set ke hasil hitung fisik, selisihnya dicatat
   * sebagai ADJUSTMENT supaya deteksi anomali punya bahan.
   */
  async stockOpname(userId: string, dto: StockOpnameDto, umkmId: string | null) {
    const product = await this.resolveProduct(dto, umkmId);
    const difference = dto.countedStock - product.stock;

    if (difference === 0) {
      return {
        product: { id: product.id, name: product.name },
        systemStock: product.stock,
        countedStock: dto.countedStock,
        difference: 0,
        transaction: null,
        message: 'Stok fisik sudah cocok dengan catatan sistem',
      };
    }

    const reasonLabel = difference > 0 ? 'lebih' : 'kurang';
    const result = await this.writeMovement(userId, product, {
      type: InventoryTransactionType.ADJUSTMENT,
      quantity: Math.abs(difference),
      newStock: dto.countedStock,
      reason: `Stok opname: fisik ${dto.countedStock}, sistem ${product.stock} (${reasonLabel} ${Math.abs(difference)})${dto.reason ? ` — ${dto.reason}` : ''}`,
    });

    return {
      product: { id: product.id, name: product.name },
      systemStock: product.stock,
      countedStock: dto.countedStock,
      difference,
      transaction: result.transaction,
    };
  }

  /**
   * Menulis stok baru dan catatan transaksinya dalam satu transaksi database,
   * supaya angka stok dan riwayatnya tidak pernah berbeda.
   */
  private async writeMovement(
    userId: string,
    product: ResolvedProduct,
    movement: {
      type: InventoryTransactionType;
      quantity: number;
      newStock: number;
      reason: string;
    },
  ) {
    const isKopdes = product.kind === 'KOPDES';

    return this.prisma.$transaction(async (tx) => {
      if (isKopdes) {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: movement.newStock },
        });
      } else {
        await tx.uMKMProduct.update({
          where: { id: product.id },
          data: { stock: movement.newStock },
        });
      }

      const transaction = await tx.inventoryTransaction.create({
        data: {
          productId: isKopdes ? product.id : null,
          umkmProductId: isKopdes ? null : product.id,
          type: movement.type,
          quantity: movement.quantity,
          stockAfter: movement.newStock,
          reason: movement.reason,
          userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'INVENTORY_MOVEMENT',
          details: `${movement.type} ${movement.quantity} untuk "${product.name}" (${product.id}): stok ${product.stock} → ${movement.newStock}. Alasan: ${movement.reason}`,
        },
      });

      return {
        product: { id: product.id, name: product.name },
        previousStock: product.stock,
        currentStock: movement.newStock,
        transaction,
      };
    });
  }

  // ---- Pembungkus sisi mitra: umkmId selalu diturunkan dari akun pemanggil ----

  async listTransactionsForSeller(userId: string, query: ListTransactionsQueryDto) {
    return this.listTransactions(query, await this.getUmkmIdOrThrow(userId));
  }

  async adjustStockForSeller(userId: string, dto: AdjustStockDto) {
    return this.adjustStock(userId, dto, await this.getUmkmIdOrThrow(userId));
  }

  async stockOpnameForSeller(userId: string, dto: StockOpnameDto) {
    return this.stockOpname(userId, dto, await this.getUmkmIdOrThrow(userId));
  }
}

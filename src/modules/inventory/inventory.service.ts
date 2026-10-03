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
  LiveFeedQueryDto,
  PosMovementDto,
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
    kopdesId: string | null = null,
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
        select: { id: true, name: true, stock: true, kopdesId: true },
      });
      if (!product) {
        throw new NotFoundException('Produk tidak ditemukan');
      }
      // Staf desa tidak boleh menggeser stok gudang desa lain.
      if (kopdesId && product.kopdesId !== kopdesId) {
        throw new ForbiddenException(
          'Barang ini bukan milik Kopdes tempat Anda bertugas',
        );
      }
      return {
        kind: 'KOPDES',
        id: product.id,
        name: product.name,
        stock: product.stock,
      };
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
    if (kopdesId) {
      const mitra = await this.prisma.uMKM.findUnique({
        where: { id: umkmProduct.umkmId },
        select: { kopdesId: true },
      });
      if (mitra?.kopdesId !== kopdesId) {
        throw new ForbiddenException(
          'Mitra ini tidak bernaung di Kopdes tempat Anda bertugas',
        );
      }
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
  async listTransactions(
    query: ListTransactionsQueryDto,
    umkmId: string | null,
    kopdesId: string | null = null,
  ) {
    const where: Prisma.InventoryTransactionWhereInput = {};

    if (query.productId || query.umkmProductId) {
      const product = await this.resolveProduct(query, umkmId, kopdesId);
      if (product.kind === 'KOPDES') {
        where.productId = product.id;
      } else {
        where.umkmProductId = product.id;
      }
    } else if (umkmId) {
      // Mitra tanpa filter produk hanya melihat riwayat seluruh produknya sendiri.
      where.umkmProduct = { umkmId };
    } else if (kopdesId) {
      // Staf tanpa filter produk melihat riwayat desanya: barang Kopdes
      // sendiri maupun barang mitra yang bernaung di bawahnya.
      where.OR = [
        { product: { kopdesId } },
        { umkmProduct: { umkm: { kopdesId } } },
      ];
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
  async adjustStock(
    userId: string,
    dto: AdjustStockDto,
    umkmId: string | null,
    kopdesId: string | null = null,
    externalRef?: string,
  ) {
    const product = await this.resolveProduct(dto, umkmId, kopdesId);

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
      externalRef,
    });
  }

  /**
   * Stok opname: stok di-set ke hasil hitung fisik, selisihnya dicatat
   * sebagai ADJUSTMENT supaya deteksi anomali punya bahan.
   */
  async stockOpname(
    userId: string,
    dto: StockOpnameDto,
    umkmId: string | null,
    kopdesId: string | null = null,
  ) {
    const product = await this.resolveProduct(dto, umkmId, kopdesId);
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
      externalRef?: string;
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
          externalRef: movement.externalRef ?? null,
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

  /**
   * Mencatat satu pergerakan stok dari kasir POS.
   *
   * Idempoten berdasarkan `externalRef`. Kasir di desa berjalan di atas
   * jaringan yang putus-nyambung: ia akan mengirim ulang permintaan yang
   * jawabannya tidak pernah sampai, dan tanpa penjagaan ini satu struk
   * memotong stok dua kali. Kiriman ulang dijawab dengan catatan yang sama
   * seperti kiriman pertama, ditandai `duplicate: true`, bukan error — kasir
   * tidak punya cara membedakan "sudah masuk" dari "gagal".
   */
  async recordPosMovement(
    userId: string,
    dto: PosMovementDto,
    umkmId: string | null,
    kopdesId: string | null = null,
  ) {
    const existing = await this.findByExternalRef(dto.externalRef);
    if (existing) return existing;

    try {
      const result = await this.adjustStock(
        userId,
        dto,
        umkmId,
        kopdesId,
        dto.externalRef,
      );
      return { ...result, duplicate: false };
    } catch (error) {
      // Dua kiriman yang berpacu: yang kalah ditolak unique index, bukan
      // oleh pemeriksaan di atas. Hasilnya tetap satu pergerakan.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const settled = await this.findByExternalRef(dto.externalRef);
        if (settled) return settled;
      }
      throw error;
    }
  }

  private async findByExternalRef(externalRef: string) {
    const transaction = await this.prisma.inventoryTransaction.findUnique({
      where: { externalRef },
      include: {
        product: { select: { id: true, name: true, stock: true } },
        umkmProduct: { select: { id: true, name: true, stock: true } },
      },
    });
    if (!transaction) return null;

    const product = transaction.product ?? transaction.umkmProduct;
    return {
      product: { id: product?.id ?? '', name: product?.name ?? '' },
      // Stok saat ini, bukan `stockAfter` catatan lama: pergerakan lain bisa
      // terjadi di antaranya, dan kasir butuh angka yang berlaku sekarang.
      currentStock: product?.stock ?? transaction.stockAfter ?? 0,
      previousStock: (transaction.stockAfter ?? 0) + transaction.quantity,
      transaction,
      duplicate: true,
    };
  }

  /**
   * Umpan pemantauan stok untuk pemilik toko.
   *
   * Penarikan berkala, bukan dorongan dari server: backend ini berjalan
   * sebagai fungsi serverless di Vercel, yang tidak menahan koneksi
   * WebSocket maupun SSE hidup-hidup. Yang bisa diandalkan adalah klien
   * bertanya "apa yang berubah sejak penanda ini".
   *
   * [since] HARUS berasal dari `serverTime` respons sebelumnya, bukan jam
   * perangkat. Jam kasir dan jam ponsel pemilik tidak pernah sama persis,
   * dan selisih beberapa detik sudah cukup untuk melewatkan satu baris atau
   * mengirimkannya dua kali.
   */
  async liveFeed(
    umkmId: string | null,
    kopdesId: string | null,
    since?: string,
    limit = 50,
  ) {
    const take = Math.min(Math.max(limit, 1), 200);
    const serverTime = new Date();

    const scope: Prisma.InventoryTransactionWhereInput = umkmId
      ? { umkmProduct: { umkmId } }
      : kopdesId
        ? {
            OR: [
              { product: { kopdesId } },
              { umkmProduct: { umkm: { kopdesId } } },
            ],
          }
        : {};

    const where: Prisma.InventoryTransactionWhereInput = since
      ? { ...scope, createdAt: { gt: new Date(since) } }
      : scope;

    const movements = await this.prisma.inventoryTransaction.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, stock: true } },
        umkmProduct: { select: { id: true, name: true, stock: true } },
        user: { select: { id: true, name: true } },
      },
      // Menaik saat menyusul dari penanda — klien menambahkannya ke ujung
      // daftar sesuai urutan kejadian. Tanpa penanda yang dicari justru yang
      // terbaru, jadi urutannya dibalik.
      orderBy: { createdAt: since ? 'asc' : 'desc' },
      take: take + 1,
    });

    const hasMore = movements.length > take;
    const page = hasMore ? movements.slice(0, take) : movements;

    return {
      // Penanda untuk permintaan berikutnya. Saat ada yang terpotong karena
      // batas, penanda maju hanya sampai baris terakhir yang benar-benar
      // dikirim — kalau tidak, sisanya hilang selamanya.
      serverTime: (hasMore && since
        ? page[page.length - 1].createdAt
        : serverTime
      ).toISOString(),
      hasMore,
      movements: page.map((m) => {
        const product = m.product ?? m.umkmProduct;
        return {
          id: m.id,
          type: m.type,
          quantity: m.quantity,
          stockAfter: m.stockAfter,
          reason: m.reason,
          externalRef: m.externalRef,
          createdAt: m.createdAt.toISOString(),
          recordedBy: m.user?.name ?? null,
          product: product
            ? { id: product.id, name: product.name, stock: product.stock }
            : null,
        };
      }),
    };
  }

  // ---- Pembungkus sisi mitra: umkmId selalu diturunkan dari akun pemanggil ----

  async listTransactionsForSeller(
    userId: string,
    query: ListTransactionsQueryDto,
  ) {
    return this.listTransactions(query, await this.getUmkmIdOrThrow(userId));
  }

  async adjustStockForSeller(userId: string, dto: AdjustStockDto) {
    return this.adjustStock(userId, dto, await this.getUmkmIdOrThrow(userId));
  }

  async recordPosMovementForSeller(userId: string, dto: PosMovementDto) {
    return this.recordPosMovement(
      userId,
      dto,
      await this.getUmkmIdOrThrow(userId),
    );
  }

  async liveFeedForSeller(userId: string, query: LiveFeedQueryDto) {
    return this.liveFeed(
      await this.getUmkmIdOrThrow(userId),
      null,
      query.since,
      query.limit,
    );
  }

  async stockOpnameForSeller(userId: string, dto: StockOpnameDto) {
    return this.stockOpname(userId, dto, await this.getUmkmIdOrThrow(userId));
  }

  /**
   * Daftar barang untuk halaman Manajemen Stok.
   *
   * Penyaringan "menipis" dan "habis" dikerjakan database — mengambil semua
   * produk lalu menyaringnya di aplikasi memindahkan biaya ke jaringan dan
   * memory tanpa alasan, dan tetap salah begitu katalog melewati satu halaman.
   */
  async listStock(
    kopdesId: string | null,
    filter: 'all' | 'low' | 'out' = 'all',
    page = 1,
    limit = 20,
  ) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const scope = Prisma.sql`
      "isActive" = true
      AND (${kopdesId}::text IS NULL OR "kopdesId" = ${kopdesId}::text)
    `;
    const condition =
      filter === 'low'
        ? Prisma.sql`${scope} AND "stock" > 0 AND "stock" <= "minStock"`
        : filter === 'out'
          ? Prisma.sql`${scope} AND "stock" = 0`
          : scope;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          stock: number;
          minStock: number;
          unit: string;
          sku: string | null;
          price: Prisma.Decimal;
        }[]
      >`
        SELECT "id", "name", "stock", "minStock", "unit", "sku", "price"
        FROM "Product"
        WHERE ${condition}
        ORDER BY "stock" ASC, "name" ASC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "Product" WHERE ${condition}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return {
      items: rows.map((r) => ({ ...r, price: r.price.toString() })),
      meta: {
        total,
        page: Math.max(page, 1),
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }
}

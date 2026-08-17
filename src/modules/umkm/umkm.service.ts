import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { UMKMStatus } from '@prisma/client';
import { VerifyUmkmDto } from './dto/verify-umkm.dto';
import { TakedownProductDto } from './dto/takedown-product.dto';
import {
  ListUmkmQueryDto,
  ListUmkmProductQueryDto,
} from './dto/list-umkm-query.dto';

@Injectable()
export class UmkmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ── Pengelolaan Mitra UMKM ──────────────────────────────

  async listUmkm(query: ListUmkmQueryDto) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { user: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const umkms = await this.prisma.uMKM.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        _count: { select: { products: true } },
      },
    });

    return umkms.map((u) => ({
      ...u,
      productCount: u._count.products,
    }));
  }

  async getUmkm(id: string) {
    const umkm = await this.prisma.uMKM.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        _count: { select: { products: true } },
      },
    });
    if (!umkm) throw new NotFoundException(`UMKM ${id} tidak ditemukan`);
    return { ...umkm, productCount: umkm._count.products };
  }

  async verifyUmkm(id: string, dto: VerifyUmkmDto) {
    await this.getUmkm(id); // 404 kalau tidak ada

    const umkm = await this.prisma.uMKM.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason:
          dto.status === UMKMStatus.REJECTED ? (dto.rejectionReason ?? null) : null,
        verifiedAt: dto.status === UMKMStatus.ACTIVE ? new Date() : null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    await this.cacheService.deletePattern('cache:products:*');
    return umkm;
  }

  // ── Takedown Produk UMKM ────────────────────────────────

  async listUmkmProducts(query: ListUmkmProductQueryDto) {
    const where: any = {};
    if (query.umkmId) where.umkmId = query.umkmId;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const products = await this.prisma.uMKMProduct.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        umkm: { select: { id: true, businessName: true } },
        images: { orderBy: { isPrimary: 'desc' } },
      },
    });

    return products.map((p) => ({ ...p, price: Number(p.price) }));
  }

  async takedownProduct(id: string, dto: TakedownProductDto) {
    const existing = await this.prisma.uMKMProduct.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Produk UMKM ${id} tidak ditemukan`);

    const product = await this.prisma.uMKMProduct.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        // Saat di-takedown, catat alasan di kolom yang sama dipakai penolakan.
        rejectionReason: dto.isActive ? null : (dto.reason ?? 'Diturunkan oleh Admin Kopdes'),
      },
    });

    await this.cacheService.deletePattern('cache:products:*');
    return { ...product, price: Number(product.price) };
  }
}

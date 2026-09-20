import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { UMKMStatus } from '@prisma/client';
import { VerifyUmkmDto } from './dto/verify-umkm.dto';
import { TakedownProductDto } from './dto/takedown-product.dto';
import {
  ListUmkmQueryDto,
  ListUmkmProductQueryDto,
} from './dto/list-umkm-query.dto';
import { UpdateUmkmLocationDto } from './dto/update-umkm-location.dto';

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

  /**
   * Mengisi koordinat & profil lokasi Mitra UMKM.
   *
   * Dipakai form Admin Kopdes. Tanpa koordinat, UMKM tidak pernah muncul di
   * `/umkm/nearby` — itu perilaku yang benar, dan form ini jalan keluarnya.
   *
   * Latitude dan longitude harus diisi berpasangan: satu koordinat saja tidak
   * bisa dipakai menghitung jarak dan hanya akan membuat data setengah jadi.
   */
  async updateLocation(id: string, dto: UpdateUmkmLocationDto) {
    const umkm = await this.prisma.uMKM.findUnique({
      where: { id },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!umkm) throw new NotFoundException('Mitra UMKM tidak ditemukan.');

    const nextLat = dto.latitude ?? umkm.latitude;
    const nextLng = dto.longitude ?? umkm.longitude;
    const setsOne = dto.latitude !== undefined || dto.longitude !== undefined;

    if (setsOne && (nextLat === null || nextLng === null)) {
      throw new BadRequestException(
        'Latitude dan longitude harus diisi berpasangan.',
      );
    }

    return this.prisma.uMKM.update({
      where: { id },
      data: {
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
        ...(dto.operatingHours !== undefined
          ? { operatingHours: dto.operatingHours as any }
          : {}),
        ...(dto.kopdesId !== undefined ? { kopdesId: dto.kopdesId } : {}),
      },
      select: {
        id: true,
        businessName: true,
        latitude: true,
        longitude: true,
        category: true,
        photoUrl: true,
        operatingHours: true,
        kopdesId: true,
      },
    });
  }
}

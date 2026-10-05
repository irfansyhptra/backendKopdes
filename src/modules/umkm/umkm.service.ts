import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { Role, UMKMStatus } from '@prisma/client';
import { ApplyUmkmDto } from './dto/apply-umkm.dto';
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

  /**
   * Batas Kopdes. `scope` = kopdesId pengurus; null = Super Admin (semua).
   * Pengurus hanya mengurus mitra di desanya sendiri — dulu daftar dan
   * verifikasinya tidak dibatasi sama sekali.
   */
  private async assertInScope(umkmId: string, scope: string | null) {
    if (!scope) return;
    const u = await this.prisma.uMKM.findUnique({
      where: { id: umkmId },
      select: { kopdesId: true },
    });
    if (!u) throw new NotFoundException(`UMKM ${umkmId} tidak ditemukan`);
    if (u.kopdesId !== scope) {
      throw new ForbiddenException('Mitra ini bukan bagian dari Kopdes Anda');
    }
  }

  async listUmkm(query: ListUmkmQueryDto, scope: string | null = null) {
    const where: any = scope ? { kopdesId: scope } : {};
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

  async getUmkm(id: string, scope: string | null = null) {
    await this.assertInScope(id, scope);
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

  async verifyUmkm(
    id: string,
    dto: VerifyUmkmDto,
    scope: string | null = null,
  ) {
    await this.getUmkm(id, scope); // 404/403 bila tidak ada atau di luar Kopdes

    const umkm = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.uMKM.update({
        where: { id },
        data: {
          status: dto.status,
          rejectionReason:
            dto.status === UMKMStatus.REJECTED
              ? (dto.rejectionReason ?? null)
              : null,
          verifiedAt: dto.status === UMKMStatus.ACTIVE ? new Date() : null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
            },
          },
        },
      });
      // Pendaftar mandiri masih berperan CUSTOMER; disetujui berarti akunnya
      // kini akun penjual. Token berikutnya (refresh) membawa peran baru.
      if (
        dto.status === UMKMStatus.ACTIVE &&
        updated.user.role === Role.CUSTOMER
      ) {
        await tx.user.update({
          where: { id: updated.userId },
          data: { role: Role.UMKM },
        });
      }
      return updated;
    });

    await this.cacheService.deletePattern('cache:products:*');
    return umkm;
  }

  // ── Takedown Produk UMKM ────────────────────────────────

  async listUmkmProducts(
    query: ListUmkmProductQueryDto,
    scope: string | null = null,
  ) {
    const where: any = scope ? { umkm: { kopdesId: scope } } : {};
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

  async takedownProduct(
    id: string,
    dto: TakedownProductDto,
    scope: string | null = null,
  ) {
    const existing = await this.prisma.uMKMProduct.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(`Produk UMKM ${id} tidak ditemukan`);
    await this.assertInScope(existing.umkmId, scope);

    const product = await this.prisma.uMKMProduct.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        // Saat di-takedown, catat alasan di kolom yang sama dipakai penolakan.
        rejectionReason: dto.isActive
          ? null
          : (dto.reason ?? 'Diturunkan oleh Admin Kopdes'),
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
  async updateLocation(
    id: string,
    dto: UpdateUmkmLocationDto,
    scope: string | null = null,
  ) {
    await this.assertInScope(id, scope);
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

  // ── Pendaftaran Mitra oleh pemilik usaha ────────────────

  /**
   * Customer mengajukan diri menjadi mitra UMKM di Kopdes desanya. Barisnya
   * langsung baris UMKM berstatus PENDING_VERIFICATION — pengurus Kopdes
   * yang dipilih memeriksanya di daftar Mitra seperti biasa. Ditolak boleh
   * mengajukan ulang; selain itu satu akun satu pengajuan.
   */
  async apply(userId: string, dto: ApplyUmkmDto) {
    const kopdes = await this.prisma.koperasi.findUnique({
      where: { id: dto.kopdesId },
      select: { id: true, isActive: true },
    });
    if (!kopdes || !kopdes.isActive) {
      throw new BadRequestException('Kopdes yang dipilih tidak tersedia.');
    }

    const existing = await this.prisma.uMKM.findUnique({ where: { userId } });
    if (existing && existing.status !== UMKMStatus.REJECTED) {
      throw new ConflictException(
        existing.status === UMKMStatus.PENDING_VERIFICATION
          ? 'Pengajuan Anda masih menunggu verifikasi pengurus Kopdes.'
          : 'Akun ini sudah terdaftar sebagai mitra UMKM.',
      );
    }

    const data = {
      businessName: dto.businessName,
      description: dto.description ?? '',
      address: dto.address,
      phone: dto.phone,
      category: dto.category,
      kopdesId: dto.kopdesId,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      status: UMKMStatus.PENDING_VERIFICATION,
      rejectionReason: null,
      verifiedAt: null,
    };
    if (existing) {
      await this.prisma.uMKM.update({ where: { userId }, data });
    } else {
      await this.prisma.uMKM.create({ data: { ...data, userId } });
    }
    return this.myApplication(userId);
  }

  async myApplication(userId: string) {
    return this.prisma.uMKM.findUnique({
      where: { userId },
      select: {
        id: true,
        businessName: true,
        description: true,
        address: true,
        phone: true,
        category: true,
        status: true,
        rejectionReason: true,
        verifiedAt: true,
        createdAt: true,
        kopdes: { select: { id: true, name: true, village: true } },
      },
    });
  }
}

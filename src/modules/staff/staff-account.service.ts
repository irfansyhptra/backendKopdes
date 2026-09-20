import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PasswordHelper } from '../auth/helpers/crypto.helper';
import {
  ASSIGNABLE_TO_PEGAWAI,
  PERMISSION_CATALOG,
  resolvePermissions,
} from '../../common/permissions';
import type { AuthenticatedUser } from '../auth/authenticated-request';
import type { CreatePegawaiDto, UpdatePegawaiDto } from './dto/manage-staff.dto';

/**
 * Pengelolaan akun pegawai oleh Admin Kopdes — pemilik koperasinya.
 *
 * Tiga batas dijaga di sini, bukan di UI maupun di DTO saja:
 *
 *  1. **Peran.** Yang dibuat selalu PEGAWAI_KOPDES. Perannya tidak pernah
 *     dibaca dari body, jadi tidak ada jalan meminta ADMIN_KOPDES.
 *  2. **Desa.** Penugasan mengikuti Kopdes si admin, dan setiap akun yang
 *     disentuh diperiksa lebih dulu apakah memang milik desa itu. Tanpa ini
 *     admin desa A bisa mengubah pegawai desa B hanya dengan menebak id-nya.
 *  3. **Wewenang.** Yang boleh diberikan dibatasi bawaan pegawai. Admin tidak
 *     bisa mengangkat pegawai menjadi setara dirinya.
 *
 * `resolvePermissions` menyaring sekali lagi saat izin dibaca, jadi bahkan
 * kalau baris di database sempat berisi sesuatu yang tidak semestinya, ia
 * tidak akan berlaku.
 */
@Injectable()
export class StaffAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private static readonly SAFE_SELECT = {
    id: true,
    email: true,
    name: true,
    phone: true,
    role: true,
    kopdesId: true,
    permissions: true,
    createdAt: true,
  } as const;

  /** Kopdes tempat admin bertugas; tanpa itu tidak ada yang bisa dikelola. */
  private scopeOf(actor: AuthenticatedUser): string {
    if (!actor.kopdesId) {
      throw new ForbiddenException(
        'Akun Anda belum ditugaskan ke Kopdes mana pun. Hubungi Super Admin.',
      );
    }
    return actor.kopdesId;
  }

  /**
   * Pegawai yang boleh disentuh: peran pegawai, dan di desa yang sama.
   *
   * Pesan "tidak ditemukan" dipakai juga ketika akunnya ada tapi milik desa
   * lain — membedakan keduanya memberi tahu penebak bahwa id itu benar.
   */
  private async targetOrThrow(id: string, kopdesId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: Role.PEGAWAI_KOPDES, kopdesId },
      select: StaffAccountService.SAFE_SELECT,
    });
    if (!user) {
      throw new NotFoundException('Pegawai tidak ditemukan di Kopdes ini.');
    }
    return user;
  }

  /** Izin di-cache 60 detik oleh PermissionsGuard; perubahan harus segera terasa. */
  private async invalidate(userId: string) {
    await this.cache
      .delete(PermissionsGuard.cacheKey(userId))
      .catch(() => undefined);
  }

  /** Katalog berlabel untuk panel pengaturan; sumbernya satu, di common/. */
  catalog() {
    return {
      assignable: ASSIGNABLE_TO_PEGAWAI,
      items: PERMISSION_CATALOG,
    };
  }

  async list(actor: AuthenticatedUser) {
    const kopdesId = this.scopeOf(actor);
    const rows = await this.prisma.user.findMany({
      where: { role: Role.PEGAWAI_KOPDES, kopdesId },
      orderBy: { createdAt: 'desc' },
      select: StaffAccountService.SAFE_SELECT,
    });

    // Izin efektif ikut dikirim supaya panel tidak perlu menghitung ulang
    // arti "array kosong" — yang berarti bawaan peran, bukan tanpa wewenang.
    return rows.map((u) => ({
      ...u,
      effectivePermissions: resolvePermissions(u.role, u.permissions),
      usesRoleDefaults: u.permissions.length === 0,
    }));
  }

  async create(actor: AuthenticatedUser, dto: CreatePegawaiDto) {
    const kopdesId = this.scopeOf(actor);

    const email = dto.email.trim().toLowerCase();
    const taken = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken) throw new ConflictException('Email sudah terdaftar.');

    const user = await this.prisma.user.create({
      data: {
        email,
        password: PasswordHelper.hash(dto.password),
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        role: Role.PEGAWAI_KOPDES,
        kopdesId,
        permissions: dto.permissions ?? [],
      },
      select: StaffAccountService.SAFE_SELECT,
    });

    return {
      ...user,
      effectivePermissions: resolvePermissions(user.role, user.permissions),
      usesRoleDefaults: user.permissions.length === 0,
    };
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdatePegawaiDto) {
    const kopdesId = this.scopeOf(actor);
    await this.targetOrThrow(id, kopdesId);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.permissions !== undefined
          ? { permissions: dto.permissions }
          : {}),
        ...(dto.password
          ? { password: PasswordHelper.hash(dto.password) }
          : {}),
      },
      select: StaffAccountService.SAFE_SELECT,
    });

    await this.invalidate(id);
    return {
      ...user,
      effectivePermissions: resolvePermissions(user.role, user.permissions),
      usesRoleDefaults: user.permissions.length === 0,
    };
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const kopdesId = this.scopeOf(actor);

    // Admin tidak bisa menghapus dirinya sendiri lewat jalur ini — tapi
    // penjagaannya sudah dari peran: targetOrThrow hanya menerima pegawai,
    // dan si admin bukan pegawai. Dicek juga di sini supaya jelas terbaca.
    if (id === actor.id) {
      throw new ForbiddenException('Akun sendiri tidak bisa dihapus di sini.');
    }

    await this.targetOrThrow(id, kopdesId);
    await this.prisma.user.delete({ where: { id } });
    await this.invalidate(id);
  }
}

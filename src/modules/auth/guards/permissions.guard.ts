import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../cache/cache.service';
import { PermissionKey, resolvePermissions } from '../../../common/permissions';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedRequest } from '../authenticated-request';

interface StaffContext {
  role: Role;
  kopdesId: string | null;
  permissions: PermissionKey[];
}

/**
 * Memeriksa permission efektif pengguna dan menempelkan konteks stafnya
 * (`kopdesId`, `permissions`) ke `req.user`.
 *
 * Konteks dibaca dari database, bukan dari klaim JWT. Token berumur panjang:
 * kalau `kopdesId` atau daftar permission ikut ditandatangani di dalamnya,
 * mencabut wewenang seorang pegawai baru berlaku setelah tokennya kedaluwarsa
 * — dan memindahkan pegawai ke desa lain akan menyisakan token yang masih
 * membuka data desa lamanya.
 *
 * Hasil lookup di-cache 60 detik supaya tidak menambah satu query per
 * request; pencabutan wewenang berlaku paling lambat satu menit, dan
 * `invalidate()` dipanggil langsung saat Super Admin mengubah akun.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private static readonly TTL_SECONDS = 60;

  static cacheKey(userId: string) {
    return `staff-context:${userId}`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user?.id) {
      throw new ForbiddenException('Sesi pengguna tidak ditemukan');
    }

    const ctx = await this.loadContext(user.id);
    if (!ctx) {
      throw new ForbiddenException('Akun tidak ditemukan');
    }

    // Konteks selalu ditempel, juga saat handler tidak meminta permission
    // apa pun — service di bawahnya memakai kopdesId ini untuk menyaring
    // data, dan diam-diam mengirim `undefined` akan membuka seluruh desa.
    request.user = {
      ...user,
      role: ctx.role,
      kopdesId: ctx.kopdesId,
      permissions: ctx.permissions,
    };

    if (!required || required.length === 0) return true;

    const missing = required.filter((p) => !ctx.permissions.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Wewenang tidak mencukupi: ${missing.join(', ')}`,
      );
    }

    return true;
  }

  private async loadContext(userId: string): Promise<StaffContext | null> {
    const key = PermissionsGuard.cacheKey(userId);
    const cached = await this.cache.get<StaffContext>(key).catch(() => null);
    if (cached) return cached;

    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, kopdesId: true, permissions: true },
    });
    if (!row) return null;

    const ctx: StaffContext = {
      role: row.role,
      kopdesId: row.kopdesId,
      permissions: resolvePermissions(row.role, row.permissions),
    };
    await this.cache
      .set(key, ctx, PermissionsGuard.TTL_SECONDS)
      .catch(() => undefined);
    return ctx;
  }
}

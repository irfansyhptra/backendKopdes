import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Role, OrderStatus } from '@prisma/client';
import { PasswordHelper } from '../auth/helpers/crypto.helper';
import {
  CreateStaffDto,
  UpdateStaffDto,
  ListUsersQueryDto,
} from './dto/staff.dto';

// Peran staf Kopdes yang boleh dibuat/dikelola Super Admin.
const STAFF_ROLES: Role[] = [Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES];

const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  kopdesId: true,
  permissions: true,
  createdAt: true,
};

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Membuang konteks staf yang di-cache PermissionsGuard.
   *
   * Tanpa ini pencabutan wewenang baru berlaku setelah TTL 60 detik habis —
   * cukup lama untuk menyelesaikan tindakan yang baru saja dilarang.
   */
  private async invalidateContext(userId: string) {
    await this.cache
      .delete(PermissionsGuard.cacheKey(userId))
      .catch(() => undefined);
  }

  /** Staf desa wajib punya penugasan Kopdes; tanpa itu dashboardnya kosong. */
  private async assertKopdesExists(kopdesId: string) {
    const found = await this.prisma.koperasi.findUnique({
      where: { id: kopdesId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Kopdes tidak ditemukan');
  }

  private assertStaffRole(role: Role) {
    if (!STAFF_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Super Admin hanya boleh membuat akun ADMIN_KOPDES atau PEGAWAI_KOPDES',
      );
    }
  }

  // ── Akun staf Kopdes ──
  async createStaff(dto: CreateStaffDto) {
    this.assertStaffRole(dto.role);
    if (dto.kopdesId) await this.assertKopdesExists(dto.kopdesId);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email sudah terdaftar');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: PasswordHelper.hash(dto.password),
        name: dto.name,
        phone: dto.phone,
        role: dto.role,
        kopdesId: dto.kopdesId ?? null,
        permissions: dto.permissions ?? [],
      },
      select: safeUserSelect,
    });
    return user;
  }

  async listStaff() {
    return this.prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      select: safeUserSelect,
    });
  }

  private async getStaffOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Akun tidak ditemukan');
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'Hanya akun staf Kopdes yang dapat dikelola',
      );
    }
    return user;
  }

  async updateStaff(id: string, dto: UpdateStaffDto) {
    await this.getStaffOrThrow(id);
    if (dto.role) this.assertStaffRole(dto.role);
    if (dto.kopdesId) await this.assertKopdesExists(dto.kopdesId);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        role: dto.role,
        kopdesId: dto.kopdesId,
        permissions: dto.permissions,
        ...(dto.password
          ? { password: PasswordHelper.hash(dto.password) }
          : {}),
      },
      select: safeUserSelect,
    });
    await this.invalidateContext(id);
    return updated;
  }

  async deleteStaff(id: string) {
    await this.getStaffOrThrow(id);
    await this.prisma.user.delete({ where: { id } });
    await this.invalidateContext(id);
  }

  // ── Direktori seluruh pengguna ──
  async listUsers(query: ListUsersQueryDto) {
    const where: any = {};
    if (query.role) where.role = query.role;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: safeUserSelect,
    });
  }

  // ── Ikhtisar / tracking ──
  async overview() {
    const paidStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_DELIVERY,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ];

    const [
      totalUsers,
      usersByRole,
      retailProducts,
      umkmProducts,
      totalOrders,
      ordersByStatus,
      totalMitra,
      pendingMitra,
      revenueAgg,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.product.count(),
      this.prisma.uMKMProduct.count(),
      this.prisma.order.count(),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.uMKM.count(),
      this.prisma.uMKM.count({ where: { status: 'PENDING_VERIFICATION' } }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { in: paidStatuses } },
      }),
    ]);

    return {
      totalUsers,
      usersByRole: usersByRole.map((r) => ({
        role: r.role,
        count: r._count._all,
      })),
      totalProducts: retailProducts + umkmProducts,
      retailProducts,
      umkmProducts,
      totalOrders,
      ordersByStatus: ordersByStatus.map((o) => ({
        status: o.status,
        count: o._count._all,
      })),
      totalMitra,
      pendingMitra,
      totalRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
    };
  }
}

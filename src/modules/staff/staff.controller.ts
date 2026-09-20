import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { FinancePeriod, StaffService } from './staff.service';

/**
 * Endpoint agregasi untuk dashboard staf Kopdes.
 *
 * Satu endpoint per bagian dashboard, bukan satu respons raksasa: kalau
 * rekap keuangan gagal, kartu pesanan dan stok tetap tampil.
 */
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  private scope(req: AuthenticatedRequest, kopdesId?: string) {
    return this.staff.resolveScope(req.user, kopdesId);
  }

  @Get('summary')
  @RequirePermissions(Permission.ORDER_READ, Permission.INVENTORY_READ)
  async summary(
    @Req() req: AuthenticatedRequest,
    @Query('kopdesId') kopdesId?: string,
  ) {
    const data = await this.staff.summary(this.scope(req, kopdesId));
    return { success: true, data };
  }

  @Get('today-orders')
  @RequirePermissions(Permission.ORDER_READ)
  async todayOrders(
    @Req() req: AuthenticatedRequest,
    @Query('limit', new DefaultValuePipe(3), ParseIntPipe) limit: number,
    @Query('kopdesId') kopdesId?: string,
  ) {
    const data = await this.staff.todayOrders(this.scope(req, kopdesId), limit);
    return { success: true, data };
  }

  @Get('stock-summary')
  @RequirePermissions(Permission.INVENTORY_READ)
  async stockSummary(
    @Req() req: AuthenticatedRequest,
    @Query('kopdesId') kopdesId?: string,
  ) {
    const data = await this.staff.stockSummary(this.scope(req, kopdesId));
    return { success: true, data };
  }

  @Get('finance')
  @RequirePermissions(Permission.FINANCE_READ_SUMMARY)
  async finance(
    @Req() req: AuthenticatedRequest,
    @Query('period') period?: string,
    @Query('kopdesId') kopdesId?: string,
  ) {
    const allowed: FinancePeriod[] = ['today', 'week', 'month'];
    const chosen = allowed.includes(period as FinancePeriod)
      ? (period as FinancePeriod)
      : 'today';
    const data = await this.staff.finance(this.scope(req, kopdesId), chosen);
    return { success: true, data };
  }

  @Get('store-status')
  async storeStatus(
    @Req() req: AuthenticatedRequest,
    @Query('kopdesId') kopdesId?: string,
  ) {
    const data = await this.staff.storeStatus(this.scope(req, kopdesId));
    return { success: true, data };
  }

  /**
   * Permission efektif pemanggil.
   *
   * Flutter memakainya untuk menyembunyikan tindakan yang memang akan ditolak
   * backend. Penyembunyian itu kenyamanan, bukan pembatasan — pembatasannya
   * tetap `PermissionsGuard` di setiap endpoint.
   */
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    const user = req.user;
    return {
      success: true,
      data: {
        role: user.role,
        kopdesId: user.kopdesId,
        permissions: user.permissions,
      },
    };
  }
}

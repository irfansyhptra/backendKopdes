import {
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';
import { Role, OrderStatus } from '@prisma/client';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

// Pengelolaan pesanan sisi staf Kopdes (Admin & Pegawai).
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @RequirePermissions(Permission.ORDER_READ)
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
  ) {
    const { orders, meta } = await this.orderService.listAllForAdmin(
      status,
      req.user.kopdesId ?? null,
      page,
      limit,
    );
    return { success: true, data: orders, meta };
  }

  @Get(':id')
  @RequirePermissions(Permission.ORDER_READ)
  async detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.orderService.getOrderDetail(
      req.user.id,
      id,
      req.user.role,
      req.user.kopdesId ?? null,
    );
    return { success: true, data };
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.ORDER_PROCESS)
  async updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    // Membatalkan pesanan yang sudah dibayar adalah keputusan uang, bukan
    // pekerjaan meja: pegawai memindahkan pesanan maju, admin yang
    // membatalkannya. Dicek di sini, bukan hanya dengan menyembunyikan tombol.
    if (
      dto.status === 'CANCELLED' &&
      !req.user.permissions?.includes(Permission.ORDER_CANCEL)
    ) {
      throw new ForbiddenException(
        'Pembatalan pesanan hanya dapat dilakukan Admin Kopdes',
      );
    }

    const data = await this.orderService.updateStatus(
      req.user.id,
      id,
      dto.status,
      req.user.role,
      req.user.kopdesId ?? null,
    );
    return { success: true, data };
  }
}

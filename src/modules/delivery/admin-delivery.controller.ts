import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';
import { Role, DeliveryStatus } from '@prisma/client';
import { AssignCourierDto } from './dto/assign-courier.dto';

// Pengelolaan kurir & penugasan pengantaran oleh staf Kopdes.
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class AdminDeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  private actor(req: AuthenticatedRequest) {
    return { id: req.user.id, kopdesId: req.user.kopdesId ?? null };
  }

  @Get('couriers')
  @RequirePermissions(Permission.DELIVERY_READ)
  async couriers(@Req() req: AuthenticatedRequest) {
    const data = await this.deliveryService.listCouriers(
      req.user.kopdesId ?? null,
    );
    return { success: true, data };
  }

  @Get('deliveries')
  @RequirePermissions(Permission.DELIVERY_READ)
  async deliveries(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: DeliveryStatus,
  ) {
    const data = await this.deliveryService.listDeliveries(
      status,
      req.user.kopdesId ?? null,
    );
    return { success: true, data };
  }

  @Patch('deliveries/:id/assign')
  @RequirePermissions(Permission.DELIVERY_ASSIGN)
  async assign(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AssignCourierDto,
  ) {
    const data = await this.deliveryService.assignCourier(
      id,
      dto.courierId,
      this.actor(req),
    );
    return { success: true, data };
  }

  @Patch('deliveries/:id/unassign')
  @RequirePermissions(Permission.DELIVERY_UNASSIGN)
  async unassign(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const data = await this.deliveryService.unassignCourier(
      id,
      this.actor(req),
    );
    return { success: true, data };
  }
}

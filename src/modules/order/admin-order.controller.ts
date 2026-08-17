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
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, OrderStatus } from '@prisma/client';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

// Pengelolaan pesanan sisi Admin Kopdes.
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async list(@Query('status') status?: OrderStatus) {
    const data = await this.orderService.listAllForAdmin(status);
    return { success: true, data };
  }

  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    const data = await this.orderService.getOrderDetail(req.user.id, id, req.user.role);
    return { success: true, data };
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const data = await this.orderService.updateStatus(req.user.id, id, dto.status);
    return { success: true, data };
  }
}

import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, DeliveryStatus } from '@prisma/client';
import { AssignCourierDto } from './dto/assign-courier.dto';

// Pengelolaan kurir & penugasan pengantaran oleh Admin Kopdes.
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class AdminDeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('couriers')
  async couriers() {
    const data = await this.deliveryService.listCouriers();
    return { success: true, data };
  }

  @Get('deliveries')
  async deliveries(@Query('status') status?: DeliveryStatus) {
    const data = await this.deliveryService.listDeliveries(status);
    return { success: true, data };
  }

  @Patch('deliveries/:id/assign')
  async assign(@Param('id') id: string, @Body() dto: AssignCourierDto) {
    const data = await this.deliveryService.assignCourier(id, dto.courierId);
    return { success: true, data };
  }
}

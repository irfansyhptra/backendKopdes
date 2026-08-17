import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('courier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COURIER)
export class CourierController {
  constructor(private readonly deliveryService: DeliveryService) {}

  // 1. Get assigned deliveries for logged-in Courier
  @Get('deliveries')
  async getMyDeliveries(@Req() req: any) {
    const courierId = req.user.id;
    const data = await this.deliveryService.getCourierDeliveries(courierId);
    return { success: true, data };
  }

  // 2. Button Action: [Barang Sudah Diantar]
  @Patch('deliveries/:id/mark-delivered')
  async markDelivered(@Req() req: any, @Param('id') id: string) {
    const courierId = req.user.id;
    const data = await this.deliveryService.markCourierDelivered(id, courierId);
    return {
      success: true,
      message: 'Status pengiriman berhasil diubah menjadi BARANG SUDAH DIANTAR. Menunggu konfirmasi Customer.',
      data,
    };
  }

  // 3. Live GPS Location tracking update from Courier App
  @Post('deliveries/:id/location')
  async updateLocation(
    @Req() req: any,
    @Param('id') id: string,
    @Body('latitude') latitude: number,
    @Body('longitude') longitude: number,
  ) {
    const courierId = req.user.id;
    const data = await this.deliveryService.updateCourierLocation(
      id,
      courierId,
      latitude,
      longitude,
    );
    return { success: true, data };
  }
}

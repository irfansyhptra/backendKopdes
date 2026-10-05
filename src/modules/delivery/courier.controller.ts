import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { CourierService } from './courier.service';
import { DeliveryService } from './delivery.service';
import {
  CourierHistoryQueryDto,
  CourierPointDto,
  MarkDeliveredDto,
  ReleaseTaskDto,
} from './dto/courier.dto';

/**
 * Aplikasi kurir.
 *
 * Kurir mengambil tugas sendiri dari kumpulan terbuka Kopdes-nya; pengurus
 * tidak perlu menugaskan. Semua jalur di sini terikat pada kurir yang masuk,
 * jadi id pengantaran yang ditebak pun tidak membuka tugas orang lain.
 */
@Controller('courier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COURIER)
export class CourierController {
  constructor(
    private readonly courier: CourierService,
    private readonly deliveryService: DeliveryService,
  ) {}

  /** Angka dasbor: tugas tersedia, tugas aktif, antaran & COD hari ini. */
  @Get('summary')
  async summary(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.courier.summary(req.user.id) };
  }

  /** Kumpulan tugas terbuka — yang bisa diambil sendiri. */
  @Get('deliveries/available')
  async available(@Req() req: AuthenticatedRequest) {
    return {
      success: true,
      data: await this.courier.availableTasks(req.user.id),
    };
  }

  /** Log pengiriman yang sudah selesai, berhalaman. */
  @Get('deliveries/history')
  async history(
    @Req() req: AuthenticatedRequest,
    @Query() q: CourierHistoryQueryDto,
  ) {
    return {
      success: true,
      data: await this.courier.history(req.user.id, q.page, q.limit),
    };
  }

  /** Tugas yang sedang dipegang. */
  @Get('deliveries')
  async myDeliveries(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.courier.myTasks(req.user.id) };
  }

  @Get('deliveries/:id')
  async detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { success: true, data: await this.courier.detail(id, req.user.id) };
  }

  @Post('deliveries/:id/claim')
  async claim(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return {
      success: true,
      message: 'Tugas diambil',
      data: await this.courier.claim(id, req.user.id),
    };
  }

  /** Menerima tugas yang ditugaskan pengurus. */
  @Patch('deliveries/:id/accept')
  async accept(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return {
      success: true,
      message: 'Tugas diterima',
      data: await this.courier.accept(id, req.user.id),
    };
  }

  /** Melepas tugas kembali ke kumpulan — hanya sebelum barang diambil. */
  @Patch('deliveries/:id/release')
  async release(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ReleaseTaskDto,
  ) {
    return {
      success: true,
      message: 'Tugas dikembalikan ke daftar tersedia',
      data: await this.courier.release(id, req.user.id, dto.reason),
    };
  }

  @Patch('deliveries/:id/pick-up')
  async pickUp(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return {
      success: true,
      message: 'Barang ditandai sudah diambil',
      data: await this.courier.markPickedUp(id, req.user.id),
    };
  }

  /** Tombol [Barang Sudah Diantar] — sisi kurir dari dual-validation. */
  @Patch('deliveries/:id/mark-delivered')
  async markDelivered(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: MarkDeliveredDto,
  ) {
    const at =
      dto.latitude !== undefined && dto.longitude !== undefined
        ? { latitude: dto.latitude, longitude: dto.longitude }
        : undefined;
    const data = await this.deliveryService.markCourierDelivered(
      id,
      req.user.id,
      at,
    );
    return {
      success: true,
      message:
        'Ditandai sudah diantar. Menunggu pembeli menekan "Barang Sudah Diterima".',
      data,
    };
  }

  /** Posisi kurir saat mengantar — yang dibaca pembeli di layar pelacakan. */
  @Post('deliveries/:id/location')
  async updateLocation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CourierPointDto,
  ) {
    const data = await this.deliveryService.updateCourierLocation(
      id,
      req.user.id,
      dto.latitude,
      dto.longitude,
    );
    return { success: true, data };
  }
}

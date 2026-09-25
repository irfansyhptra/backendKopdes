import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { DeliveryService } from './delivery.service';

/**
 * Pelacakan pengantaran dari sisi pelanggan.
 *
 * Kurir sudah mengirim koordinatnya lewat `POST /courier/deliveries/:id/
 * location` sejak awal, tetapi tidak ada satu pun endpoint untuk membacanya —
 * "live tracking" berhenti di tabel. Ini pasangan bacanya.
 *
 * Tanpa `@Roles`: yang berhak bukan satu peran melainkan hubungan dengan
 * pesanannya — pemiliknya, kurir yang ditugaskan, atau pengurus Kopdes
 * asalnya. `PermissionsGuard` ikut dipasang supaya `kopdesId` terisi pada
 * `req.user`, karena itulah yang dipakai service untuk membatasi per desa.
 */
@Controller('orders/:orderId/tracking')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TrackingController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  async track(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.delivery.getTrackingForOrder(orderId, {
      id: req.user.id,
      role: req.user.role,
      kopdesId: req.user.kopdesId,
    });
    return { success: true, data };
  }
}

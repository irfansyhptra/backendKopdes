import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import type { MidtransNotification } from './midtrans.types';

/**
 * Notifikasi pembayaran dari Midtrans.
 *
 * **Tanpa JwtAuthGuard** — yang memanggil adalah Midtrans, bukan pengguna.
 * Yang menggantikan autentikasi adalah `signature_key`, diperiksa di service
 * sebelum apa pun disentuh.
 *
 * Selalu menjawab 200, bahkan untuk notifikasi yang ditolak. Midtrans
 * mengirim ulang apa pun yang tidak dijawab 200, dan notifikasi yang salah
 * tanda tangannya tidak akan menjadi benar pada percobaan kedua — menjawab
 * 4xx hanya membuatnya berdatangan berhari-hari. Alasan penolakan dicatat di
 * `PaymentWebhookEvent` untuk ditelusuri.
 */
@Controller('payments/midtrans')
export class MidtransWebhookController {
  constructor(private readonly payments: PaymentService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() notification: MidtransNotification) {
    const result = await this.payments.handleNotification(notification);
    return { success: true, ...result };
  }
}

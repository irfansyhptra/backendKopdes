import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/payment.dto';

/**
 * Pembayaran pesanan.
 *
 * Seluruh endpoint menuntut autentikasi, dan tiap permintaan diperiksa apakah
 * pesanannya memang milik penggunanya — id pesanan bukan rahasia, jadi
 * mengetahuinya tidak boleh cukup untuk membayarnya atau melihat tagihannya.
 */
@Controller('payments')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  /**
   * Membuat transaksi Midtrans.
   *
   * Dibatasi lebih ketat daripada endpoint lain: tiap panggilan menyentuh
   * gateway pihak ketiga, dan penekanan tombol beruntun tidak boleh menjadi
   * beban di sana. Klik ganda sendiri sudah ditahan idempotensi di service.
   */
  @Post('create')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePaymentDto,
  ) {
    const data = await this.payments.create(
      req.user.id,
      dto.orderId,
      dto.paymentMethod,
    );
    return { success: true, data };
  }

  @Get(':orderId')
  async detail(
    @Req() req: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return {
      success: true,
      data: await this.payments.get(req.user.id, orderId),
    };
  }

  /**
   * Menanyakan status langsung ke Midtrans.
   *
   * Jaring pengaman bila webhook tidak sampai, dan yang dipanggil halaman
   * instruksi saat pengguna menekan "Cek Status". Dibatasi karena halaman itu
   * juga memanggilnya berkala.
   */
  @Post(':orderId/check-status')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async checkStatus(
    @Req() req: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return {
      success: true,
      data: await this.payments.checkStatus(req.user.id, orderId),
    };
  }
}

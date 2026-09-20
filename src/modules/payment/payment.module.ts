import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';
import { PaymentController } from './payment.controller';
import { MidtransWebhookController } from './midtrans-webhook.controller';
import { PaymentService } from './payment.service';
import { MidtransService } from './midtrans.service';

@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    ConfigModule,
    // Batas bawaan yang longgar; endpoint pembayaran mempersempitnya sendiri
    // lewat @Throttle. Dipasang di modul ini saja supaya tidak mengubah
    // perilaku endpoint lain yang sudah berjalan.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [PaymentController, MidtransWebhookController],
  providers: [PaymentService, MidtransService],
  exports: [PaymentService],
})
export class PaymentModule {}

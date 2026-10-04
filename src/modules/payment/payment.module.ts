import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';
import { PaymentController } from './payment.controller';
import { PaymentReturnController } from './payment-return.controller';
import { MidtransWebhookController } from './midtrans-webhook.controller';
import { PaymentService } from './payment.service';
import { MidtransModule } from './midtrans.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    ConfigModule,
    MidtransModule,
    // Webhook Midtrans melayani dua jenis transaksi: pembayaran pesanan dan
    // isi ulang saldo. Perutean ada di controller webhook, jadi modul ini
    // butuh WalletModule — dan WalletModule sengaja tidak mengimpor modul ini.
    WalletModule,
    // Batas bawaan yang longgar; endpoint pembayaran mempersempitnya sendiri
    // lewat @Throttle. Dipasang di modul ini saja supaya tidak mengubah
    // perilaku endpoint lain yang sudah berjalan.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [
    PaymentController,
    MidtransWebhookController,
    PaymentReturnController,
  ],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}

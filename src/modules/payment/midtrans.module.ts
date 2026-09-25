import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MidtransService } from './midtrans.service';

/**
 * Pembungkus Midtrans yang berdiri sendiri.
 *
 * Dipisah dari `PaymentModule` supaya `WalletModule` bisa memakainya tanpa
 * ikut menarik seluruh modul pembayaran — dan supaya controller webhook di
 * `PaymentModule` bisa merutekan notifikasi ke `WalletModule` tanpa keduanya
 * saling mengimpor.
 */
@Module({
  imports: [ConfigModule],
  providers: [MidtransService],
  exports: [MidtransService],
})
export class MidtransModule {}

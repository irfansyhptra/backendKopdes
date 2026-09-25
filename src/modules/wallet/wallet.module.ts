import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { MidtransModule } from '../payment/midtrans.module';
import { WalletService } from './wallet.service';
import { AdminWalletController, WalletController } from './wallet.controller';

/**
 * Sengaja TIDAK mengimpor `PaymentModule`: yang dibutuhkan hanya pembungkus
 * Midtrans, dan mengimpor seluruh modul pembayaran akan membuat lingkaran
 * karena controller webhook di sana merutekan notifikasi ke sini.
 */
@Module({
  imports: [DatabaseModule, MidtransModule],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}

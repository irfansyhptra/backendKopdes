import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AdminPayoutController } from './admin-payout.controller';
import { PayoutService } from './payout.service';
import { SellerPayoutController } from './seller-payout.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SellerPayoutController, AdminPayoutController],
  providers: [PayoutService],
})
export class PayoutModule {}

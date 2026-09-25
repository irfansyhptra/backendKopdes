import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AdminDeliveryController } from './admin-delivery.controller';
import { CourierController } from './courier.controller';
import { DeliveryService } from './delivery.service';
import { TrackingController } from './tracking.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [
    AdminDeliveryController,
    CourierController,
    TrackingController,
  ],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}


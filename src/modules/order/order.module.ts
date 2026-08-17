import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { AdminOrderController } from './admin-order.controller';
import { OrderService } from './order.service';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}

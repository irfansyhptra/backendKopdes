import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}

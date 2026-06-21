import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}

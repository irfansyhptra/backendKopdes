import { Module } from '@nestjs/common';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [DatabaseModule, CacheModule, StorageModule],
  controllers: [SellerController],
  providers: [SellerService],
})
export class SellerModule {}

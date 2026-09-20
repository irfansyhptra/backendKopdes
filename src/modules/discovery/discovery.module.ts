import { Module } from '@nestjs/common';

import { CacheModule } from '../../cache/cache.module';
import { DatabaseModule } from '../../database/database.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { MarketplaceService } from './marketplace.service';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, MarketplaceService],
  exports: [DiscoveryService, MarketplaceService],
})
export class DiscoveryModule {}

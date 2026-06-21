import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../../database/prisma.module';
import { CacheModule } from '../../cache/cache.module';
import { StorageModule } from '../../storage/storage.module';
import { QdrantModule } from '../../qdrant/qdrant.module';

@Module({
  imports: [PrismaModule, CacheModule, StorageModule, QdrantModule],
  controllers: [HealthController],
})
export class HealthModule {}

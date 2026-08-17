import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';
import { UmkmController } from './umkm.controller';
import { UmkmService } from './umkm.service';

@Module({
  imports: [DatabaseModule, CacheModule, ConfigModule],
  controllers: [UmkmController],
  providers: [UmkmService],
  exports: [UmkmService],
})
export class UMKMModule {}

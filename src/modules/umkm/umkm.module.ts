import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';
import { UmkmController } from './umkm.controller';
import { UmkmService } from './umkm.service';
import { MitraController } from './mitra.controller';
import { MitraService } from './mitra.service';

@Module({
  imports: [DatabaseModule, CacheModule, ConfigModule],
  controllers: [UmkmController, MitraController],
  providers: [UmkmService, MitraService],
  exports: [UmkmService, MitraService],
})
export class UMKMModule {}

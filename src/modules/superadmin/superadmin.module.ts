import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';
import {
  KopdesApplicationAdminController,
  KopdesApplicationPublicController,
} from './kopdes-application.controller';
import { KopdesApplicationService } from './kopdes-application.service';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [
    SuperAdminController,
    KopdesApplicationPublicController,
    KopdesApplicationAdminController,
  ],
  providers: [SuperAdminService, KopdesApplicationService],
})
export class SuperAdminModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}

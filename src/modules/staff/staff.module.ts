import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffAccountController } from './staff-account.controller';
import { StaffAccountService } from './staff-account.service';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [StaffController, StaffAccountController],
  providers: [StaffService, StaffAccountService],
  exports: [StaffService],
})
export class StaffModule {}

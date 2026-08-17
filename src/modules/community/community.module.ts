import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}


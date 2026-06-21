import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SeedController],
  providers: [SeedService],
})
export class AdminModule {}

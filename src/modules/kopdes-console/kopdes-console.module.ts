import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { KopdesConsoleController } from './kopdes-console.controller';
import { KopdesConsoleService } from './kopdes-console.service';

@Module({
  imports: [DatabaseModule],
  controllers: [KopdesConsoleController],
  providers: [KopdesConsoleService],
})
export class KopdesConsoleModule {}

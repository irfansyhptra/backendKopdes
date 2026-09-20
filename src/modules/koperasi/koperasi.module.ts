import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { KoperasiController } from './koperasi.controller';
import { KoperasiService } from './koperasi.service';

@Module({
  imports: [DatabaseModule],
  controllers: [KoperasiController],
  providers: [KoperasiService],
  exports: [KoperasiService],
})
export class KoperasiModule {}

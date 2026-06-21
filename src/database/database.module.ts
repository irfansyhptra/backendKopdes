import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  exports: [PrismaModule],
})
export class DatabaseModule {}

import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { PrismaModule } from '../../database/prisma.module';
import { QdrantModule } from '../../qdrant/qdrant.module';

@Module({
  imports: [PrismaModule, QdrantModule],
  controllers: [AIController],
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}

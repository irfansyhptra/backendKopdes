import { Module, Global } from '@nestjs/common';
import { QdrantProvider } from './qdrant.provider';
import { QdrantService } from './qdrant.service';

@Global()
@Module({
  providers: [QdrantProvider, QdrantService],
  exports: [QdrantService],
})
export class QdrantModule {}

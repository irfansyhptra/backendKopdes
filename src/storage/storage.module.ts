import { Module, Global } from '@nestjs/common';
import { MinioProvider } from './minio.provider';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [MinioProvider, StorageService],
  exports: [StorageService],
})
export class StorageModule {}

import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';
import { CloudinarySignatureController } from './cloudinary-signature.controller';

@Global()
@Module({
  controllers: [CloudinarySignatureController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}

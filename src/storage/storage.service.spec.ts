import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';
import { validate } from '../config/env.validation';

describe('StorageService', () => {
  let service: StorageService;
  let module: TestingModule;

  beforeAll(async () => {
    process.env.MINIO_ACCESS_KEY = 'S3RVER';
    process.env.MINIO_SECRET_KEY = 'S3RVER';
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate,
        }),
        StorageModule,
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    await module.init();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should perform single file upload, download, presigned URL, and delete', async () => {
    const file = {
      buffer: Buffer.from('hello world s3 storage file contents'),
      originalname: 'test.txt',
      mimetype: 'text/plain',
    };
    const folder = 'products/test-product-123';

    // Upload file
    const objectKey = await service.uploadFile(file, folder);
    expect(objectKey).toContain('products/test-product-123/');
    expect(objectKey).toContain('.txt');

    // Download file and verify content
    const downloadedBuffer = await service.downloadFile(objectKey);
    expect(downloadedBuffer.toString()).toBe(
      'hello world s3 storage file contents',
    );

    // Generate public and presigned URLs
    const publicUrl = await service.getPublicUrl(objectKey);
    expect(publicUrl).toContain('localhost:9000');
    expect(publicUrl).toContain(objectKey);

    const presignedUrl = await service.getPresignedUrl(objectKey);
    expect(presignedUrl).toContain('localhost:9000');

    // Delete file
    await service.deleteFile(objectKey);

    // Verify file deleted by attempting to download and catching error
    await expect(service.downloadFile(objectKey)).rejects.toThrow();
  });

  it('should upload buffer and verify content', async () => {
    const buffer = Buffer.from('buffer upload data');
    const fileName = 'buffer-file.bin';
    const mimeType = 'application/octet-stream';
    const folder = 'users/user-456';

    const objectKey = await service.uploadBuffer(
      buffer,
      fileName,
      mimeType,
      folder,
    );
    expect(objectKey).toBe('users/user-456/buffer-file.bin');

    const downloadedBuffer = await service.downloadFile(objectKey);
    expect(downloadedBuffer.toString()).toBe('buffer upload data');

    await service.deleteFile(objectKey);
  });

  it('should check health of storage service', async () => {
    const healthy = await service.checkHealth();
    expect(healthy).toBe(true);
  });
});

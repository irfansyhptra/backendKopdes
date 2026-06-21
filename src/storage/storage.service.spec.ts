import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';
import { validate } from '../config/env.validation';

const mockStorageMethods = {
  from: jest.fn().mockReturnThis(),
  upload: jest.fn().mockImplementation((path, body) => {
    if (path.includes('buffer-file.bin')) {
      // Mock for buffer upload
      mockStorageMethods.download.mockResolvedValueOnce({
        data: {
          arrayBuffer: () => Promise.resolve(Buffer.from('buffer upload data')),
        },
        error: null,
      });
    } else {
      mockStorageMethods.download.mockResolvedValueOnce({
        data: {
          arrayBuffer: () => Promise.resolve(Buffer.from('hello world s3 storage file contents')),
        },
        error: null,
      });
    }
    return Promise.resolve({ data: {}, error: null });
  }),
  download: jest.fn(),
  remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
  createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://supabase.co/signed' }, error: null }),
  getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://supabase.co/public' } }),
  getBucket: jest.fn().mockResolvedValue({ data: {}, error: null }),
  createBucket: jest.fn().mockResolvedValue({ data: {}, error: null }),
  listBuckets: jest.fn().mockResolvedValue({ data: [], error: null }),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: mockStorageMethods,
  })),
}));

describe('StorageService', () => {
  let service: StorageService;
  let module: TestingModule;

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';
    process.env.SUPABASE_ANON_KEY = 'mock-anon';

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
    expect(publicUrl).toBe('https://supabase.co/public');

    const presignedUrl = await service.getPresignedUrl(objectKey);
    expect(presignedUrl).toBe('https://supabase.co/signed');

    // Delete file
    await service.deleteFile(objectKey);
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

import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';
import { MINIO_CLIENT } from './minio.provider';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from './interfaces/storage.interface';

@Injectable()
export class StorageService implements OnModuleInit, IStorageService {
  private readonly defaultBucket: string;

  constructor(
    @Inject(MINIO_CLIENT) private readonly minioClient: Minio.Client,
    private readonly configService: ConfigService,
  ) {
    this.defaultBucket =
      this.configService.get<string>('MINIO_BUCKET') || 'kopdes';
  }

  async onModuleInit() {
    await this.ensureBucketExists(this.defaultBucket);
  }

  async ensureBucketExists(bucketName: string): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(bucketName, 'us-east-1');

        // Define standard S3 policy for public read access
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${bucketName}/*`],
            },
          ],
        };
        await this.minioClient.setBucketPolicy(
          bucketName,
          JSON.stringify(policy),
        );
      }
    } catch (err) {
      console.error(`Failed to ensure bucket ${bucketName} exists:`, err);
    }
  }

  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
    bucketName = this.defaultBucket,
  ): Promise<string> {
    const ext = file.originalname.split('.').pop() || '';
    const randomHash = Math.random().toString(36).substring(2, 15);
    const objectKey = `${folder}/${Date.now()}-${randomHash}.${ext}`;

    await this.minioClient.putObject(
      bucketName,
      objectKey,
      file.buffer,
      file.buffer.length,
      {
        'Content-Type': file.mimetype,
      },
    );
    return objectKey;
  }

  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folder: string,
    bucketName = this.defaultBucket,
  ): Promise<string> {
    const objectKey = `${folder}/${fileName}`;

    await this.minioClient.putObject(
      bucketName,
      objectKey,
      buffer,
      buffer.length,
      {
        'Content-Type': mimeType,
      },
    );
    return objectKey;
  }

  async downloadFile(
    objectKey: string,
    bucketName = this.defaultBucket,
  ): Promise<Buffer> {
    const stream = await this.minioClient.getObject(bucketName, objectKey);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async deleteFile(
    objectKey: string,
    bucketName = this.defaultBucket,
  ): Promise<void> {
    await this.minioClient.removeObject(bucketName, objectKey);
  }

  async getPresignedUrl(
    objectKey: string,
    expirySeconds = 3600,
    bucketName = this.defaultBucket,
  ): Promise<string> {
    return this.minioClient.presignedGetObject(
      bucketName,
      objectKey,
      expirySeconds,
    );
  }

  getPublicUrl(
    objectKey: string,
    bucketName = this.defaultBucket,
  ): Promise<string> {
    const endPoint =
      this.configService.get<string>('MINIO_ENDPOINT') || 'localhost';
    const port = this.configService.get<string>('MINIO_PORT') || '9000';
    const useSSL = this.configService.get<string>('MINIO_USE_SSL') === 'true';
    const protocol = useSSL ? 'https' : 'http';
    return Promise.resolve(
      `${protocol}://${endPoint}:${port}/${bucketName}/${objectKey}`,
    );
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.minioClient.listBuckets();
      return true;
    } catch {
      return false;
    }
  }
}

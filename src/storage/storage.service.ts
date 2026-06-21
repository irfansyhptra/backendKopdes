import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IStorageService } from './interfaces/storage.interface';

@Injectable()
export class StorageService implements OnModuleInit, IStorageService {
  private supabase: SupabaseClient;
  private readonly defaultBucket: string;
  private readonly validBuckets = ['products', 'umkm', 'users', 'payments', 'deliveries'];

  constructor(private readonly configService: ConfigService) {
    let supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new BadRequestException('Supabase credentials are not configured in environment variables');
    }

    // Clean trailing /rest/v1 or /rest/v1/ if present
    supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '');

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });
    this.defaultBucket = 'kopdes';
  }

  async onModuleInit() {
    const bucketsToCreate = [...this.validBuckets, this.defaultBucket];
    for (const bucket of bucketsToCreate) {
      await this.ensureBucketExists(bucket);
    }
  }

  async ensureBucketExists(bucketName: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.storage.getBucket(bucketName);
      if (error || !data) {
        await this.supabase.storage.createBucket(bucketName, {
          public: true,
        });
      }
    } catch (err) {
      // Log error but do not block application start (e.g. if permissions restrict bucket listing/creation)
      console.warn(`Could not verify or create Supabase bucket '${bucketName}':`, err);
    }
  }

  private getBucketAndPath(
    objectKey: string,
    folder?: string,
    bucketName?: string,
  ): { bucket: string; path: string } {
    let bucket = bucketName || this.defaultBucket;
    let path = objectKey;

    if (folder) {
      const parts = folder.split('/');
      const firstFolder = parts[0];
      if (this.validBuckets.includes(firstFolder)) {
        bucket = firstFolder;
        const subfolders = parts.slice(1).join('/');
        const baseName = objectKey.split('/').pop() || '';
        path = subfolders ? `${subfolders}/${baseName}` : baseName;
      }
    } else {
      const parts = objectKey.split('/');
      const firstFolder = parts[0];
      if (this.validBuckets.includes(firstFolder)) {
        bucket = firstFolder;
        path = parts.slice(1).join('/');
      }
    }

    return { bucket, path };
  }

  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
    bucketName?: string,
  ): Promise<string> {
    const ext = file.originalname.split('.').pop() || '';
    const randomHash = Math.random().toString(36).substring(2, 15);
    const generatedName = `${Date.now()}-${randomHash}.${ext}`;

    const { bucket, path } = this.getBucketAndPath(generatedName, folder, bucketName);

    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) {
      throw new BadRequestException(`Failed to upload file to Supabase: ${error.message}`);
    }

    // Return virtual object key matching legacy path structure (e.g. products/1718293-abc.jpg)
    return folder ? `${folder.split('/')[0]}/${path}` : path;
  }

  async uploadMultipleFiles(
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
    folder: string,
    bucketName?: string,
  ): Promise<string[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file, folder, bucketName));
    return Promise.all(uploadPromises);
  }

  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folder: string,
    bucketName?: string,
  ): Promise<string> {
    const { bucket, path } = this.getBucketAndPath(fileName, folder, bucketName);

    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      throw new BadRequestException(`Failed to upload buffer to Supabase: ${error.message}`);
    }

    return folder ? `${folder.split('/')[0]}/${path}` : path;
  }

  async downloadFile(
    objectKey: string,
    bucketName?: string,
  ): Promise<Buffer> {
    const { bucket, path } = this.getBucketAndPath(objectKey, undefined, bucketName);

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .download(path);

    if (error || !data) {
      throw new BadRequestException(`Failed to download file from Supabase: ${error?.message || 'Not found'}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteFile(
    objectKey: string,
    bucketName?: string,
  ): Promise<void> {
    const { bucket, path } = this.getBucketAndPath(objectKey, undefined, bucketName);

    const { error } = await this.supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      throw new BadRequestException(`Failed to delete file from Supabase: ${error.message}`);
    }
  }

  async getPresignedUrl(
    objectKey: string,
    expirySeconds = 3600,
    bucketName?: string,
  ): Promise<string> {
    const { bucket, path } = this.getBucketAndPath(objectKey, undefined, bucketName);

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expirySeconds);

    if (error || !data?.signedUrl) {
      throw new BadRequestException(`Failed to generate signed URL from Supabase: ${error?.message || 'Error'}`);
    }

    return data.signedUrl;
  }

  async getPublicUrl(
    objectKey: string,
    bucketName?: string,
  ): Promise<string> {
    const { bucket, path } = this.getBucketAndPath(objectKey, undefined, bucketName);

    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    if (!data?.publicUrl) {
      throw new BadRequestException('Failed to generate public URL from Supabase');
    }

    return data.publicUrl;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.storage.listBuckets();
      return !error && !!data;
    } catch {
      return false;
    }
  }
}

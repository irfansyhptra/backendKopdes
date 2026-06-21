import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from './interfaces/storage.interface';
export declare class StorageService implements OnModuleInit, IStorageService {
    private readonly configService;
    private supabase;
    private readonly defaultBucket;
    private readonly validBuckets;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    ensureBucketExists(bucketName: string): Promise<void>;
    private getBucketAndPath;
    uploadFile(file: {
        buffer: Buffer;
        originalname: string;
        mimetype: string;
    }, folder: string, bucketName?: string): Promise<string>;
    uploadMultipleFiles(files: Array<{
        buffer: Buffer;
        originalname: string;
        mimetype: string;
    }>, folder: string, bucketName?: string): Promise<string[]>;
    uploadBuffer(buffer: Buffer, fileName: string, mimeType: string, folder: string, bucketName?: string): Promise<string>;
    downloadFile(objectKey: string, bucketName?: string): Promise<Buffer>;
    deleteFile(objectKey: string, bucketName?: string): Promise<void>;
    getPresignedUrl(objectKey: string, expirySeconds?: number, bucketName?: string): Promise<string>;
    getPublicUrl(objectKey: string, bucketName?: string): Promise<string>;
    checkHealth(): Promise<boolean>;
}

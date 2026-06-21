"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const supabase_js_1 = require("@supabase/supabase-js");
let StorageService = class StorageService {
    configService;
    supabase;
    defaultBucket;
    validBuckets = ['products', 'umkm', 'users', 'payments', 'deliveries'];
    constructor(configService) {
        this.configService = configService;
        let supabaseUrl = this.configService.get('SUPABASE_URL');
        const supabaseServiceKey = this.configService.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !supabaseServiceKey) {
            throw new common_1.BadRequestException('Supabase credentials are not configured in environment variables');
        }
        supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '');
        this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
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
    async ensureBucketExists(bucketName) {
        try {
            const { data, error } = await this.supabase.storage.getBucket(bucketName);
            if (error || !data) {
                await this.supabase.storage.createBucket(bucketName, {
                    public: true,
                });
            }
        }
        catch (err) {
            console.warn(`Could not verify or create Supabase bucket '${bucketName}':`, err);
        }
    }
    getBucketAndPath(objectKey, folder, bucketName) {
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
        }
        else {
            const parts = objectKey.split('/');
            const firstFolder = parts[0];
            if (this.validBuckets.includes(firstFolder)) {
                bucket = firstFolder;
                path = parts.slice(1).join('/');
            }
        }
        return { bucket, path };
    }
    async uploadFile(file, folder, bucketName) {
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
            throw new common_1.BadRequestException(`Failed to upload file to Supabase: ${error.message}`);
        }
        return folder ? `${folder.split('/')[0]}/${path}` : path;
    }
    async uploadMultipleFiles(files, folder, bucketName) {
        const uploadPromises = files.map((file) => this.uploadFile(file, folder, bucketName));
        return Promise.all(uploadPromises);
    }
    async uploadBuffer(buffer, fileName, mimeType, folder, bucketName) {
        const { bucket, path } = this.getBucketAndPath(fileName, folder, bucketName);
        const { error } = await this.supabase.storage
            .from(bucket)
            .upload(path, buffer, {
            contentType: mimeType,
            upsert: true,
        });
        if (error) {
            throw new common_1.BadRequestException(`Failed to upload buffer to Supabase: ${error.message}`);
        }
        return folder ? `${folder.split('/')[0]}/${path}` : path;
    }
    async downloadFile(objectKey, bucketName) {
        const { bucket, path } = this.getBucketAndPath(objectKey, undefined, bucketName);
        const { data, error } = await this.supabase.storage
            .from(bucket)
            .download(path);
        if (error || !data) {
            throw new common_1.BadRequestException(`Failed to download file from Supabase: ${error?.message || 'Not found'}`);
        }
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    async deleteFile(objectKey, bucketName) {
        const { bucket, path } = this.getBucketAndPath(objectKey, undefined, bucketName);
        const { error } = await this.supabase.storage
            .from(bucket)
            .remove([path]);
        if (error) {
            throw new common_1.BadRequestException(`Failed to delete file from Supabase: ${error.message}`);
        }
    }
    async getPresignedUrl(objectKey, expirySeconds = 3600, bucketName) {
        const { bucket, path } = this.getBucketAndPath(objectKey, undefined, bucketName);
        const { data, error } = await this.supabase.storage
            .from(bucket)
            .createSignedUrl(path, expirySeconds);
        if (error || !data?.signedUrl) {
            throw new common_1.BadRequestException(`Failed to generate signed URL from Supabase: ${error?.message || 'Error'}`);
        }
        return data.signedUrl;
    }
    async getPublicUrl(objectKey, bucketName) {
        const { bucket, path } = this.getBucketAndPath(objectKey, undefined, bucketName);
        const { data } = this.supabase.storage
            .from(bucket)
            .getPublicUrl(path);
        if (!data?.publicUrl) {
            throw new common_1.BadRequestException('Failed to generate public URL from Supabase');
        }
        return data.publicUrl;
    }
    async checkHealth() {
        try {
            const { data, error } = await this.supabase.storage.listBuckets();
            return !error && !!data;
        }
        catch {
            return false;
        }
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StorageService);
//# sourceMappingURL=storage.service.js.map
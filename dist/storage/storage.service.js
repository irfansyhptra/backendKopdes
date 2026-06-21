"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const Minio = __importStar(require("minio"));
const minio_provider_1 = require("./minio.provider");
const config_1 = require("@nestjs/config");
let StorageService = class StorageService {
    minioClient;
    configService;
    defaultBucket;
    constructor(minioClient, configService) {
        this.minioClient = minioClient;
        this.configService = configService;
        this.defaultBucket =
            this.configService.get('MINIO_BUCKET') || 'kopdes';
    }
    async onModuleInit() {
        await this.ensureBucketExists(this.defaultBucket);
    }
    async ensureBucketExists(bucketName) {
        try {
            const exists = await this.minioClient.bucketExists(bucketName);
            if (!exists) {
                await this.minioClient.makeBucket(bucketName, 'us-east-1');
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
                await this.minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
            }
        }
        catch (err) {
            console.error(`Failed to ensure bucket ${bucketName} exists:`, err);
        }
    }
    async uploadFile(file, folder, bucketName = this.defaultBucket) {
        const ext = file.originalname.split('.').pop() || '';
        const randomHash = Math.random().toString(36).substring(2, 15);
        const objectKey = `${folder}/${Date.now()}-${randomHash}.${ext}`;
        await this.minioClient.putObject(bucketName, objectKey, file.buffer, file.buffer.length, {
            'Content-Type': file.mimetype,
        });
        return objectKey;
    }
    async uploadBuffer(buffer, fileName, mimeType, folder, bucketName = this.defaultBucket) {
        const objectKey = `${folder}/${fileName}`;
        await this.minioClient.putObject(bucketName, objectKey, buffer, buffer.length, {
            'Content-Type': mimeType,
        });
        return objectKey;
    }
    async downloadFile(objectKey, bucketName = this.defaultBucket) {
        const stream = await this.minioClient.getObject(bucketName, objectKey);
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('error', (err) => reject(err));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    }
    async deleteFile(objectKey, bucketName = this.defaultBucket) {
        await this.minioClient.removeObject(bucketName, objectKey);
    }
    async getPresignedUrl(objectKey, expirySeconds = 3600, bucketName = this.defaultBucket) {
        return this.minioClient.presignedGetObject(bucketName, objectKey, expirySeconds);
    }
    getPublicUrl(objectKey, bucketName = this.defaultBucket) {
        const endPoint = this.configService.get('MINIO_ENDPOINT') || 'localhost';
        const port = this.configService.get('MINIO_PORT') || '9000';
        const useSSL = this.configService.get('MINIO_USE_SSL') === 'true';
        const protocol = useSSL ? 'https' : 'http';
        return Promise.resolve(`${protocol}://${endPoint}:${port}/${bucketName}/${objectKey}`);
    }
    async checkHealth() {
        try {
            await this.minioClient.listBuckets();
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(minio_provider_1.MINIO_CLIENT)),
    __metadata("design:paramtypes", [Minio.Client, config_1.ConfigService])
], StorageService);
//# sourceMappingURL=storage.service.js.map
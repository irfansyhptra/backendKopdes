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
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const cache_service_1 = require("../../cache/cache.service");
const storage_service_1 = require("../../storage/storage.service");
const qdrant_service_1 = require("../../qdrant/qdrant.service");
let HealthController = class HealthController {
    prisma;
    cacheService;
    storageService;
    qdrantService;
    constructor(prisma, cacheService, storageService, qdrantService) {
        this.prisma = prisma;
        this.cacheService = cacheService;
        this.storageService = storageService;
        this.qdrantService = qdrantService;
    }
    async checkDatabase() {
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            return true;
        }
        catch {
            return false;
        }
    }
    async checkAll() {
        const [dbHealthy, redisHealthy, storageHealthy, qdrantHealthy] = await Promise.all([
            this.checkDatabase(),
            this.cacheService.checkHealth(),
            this.storageService.checkHealth(),
            this.qdrantService.checkHealth(),
        ]);
        return {
            database: dbHealthy ? 'ok' : 'error',
            redis: redisHealthy ? 'ok' : 'error',
            storage: storageHealthy ? 'ok' : 'error',
            qdrant: qdrantHealthy ? 'ok' : 'error',
            api: 'ok',
        };
    }
    async checkDb() {
        const healthy = await this.checkDatabase();
        return { status: healthy ? 'ok' : 'error' };
    }
    async checkRedis() {
        const healthy = await this.cacheService.checkHealth();
        return { status: healthy ? 'ok' : 'error', redis: healthy ? 'PONG' : 'ERROR' };
    }
    async checkStorage() {
        const healthy = await this.storageService.checkHealth();
        return { status: healthy ? 'ok' : 'error' };
    }
    async checkQdrant() {
        const healthy = await this.qdrantService.checkHealth();
        return { status: healthy ? 'ok' : 'error' };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkAll", null);
__decorate([
    (0, common_1.Get)('database'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkDb", null);
__decorate([
    (0, common_1.Get)('redis'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkRedis", null);
__decorate([
    (0, common_1.Get)('storage'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkStorage", null);
__decorate([
    (0, common_1.Get)('qdrant'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkQdrant", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService,
        storage_service_1.StorageService,
        qdrant_service_1.QdrantService])
], HealthController);
//# sourceMappingURL=health.controller.js.map
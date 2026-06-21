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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var QdrantService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantService = void 0;
const common_1 = require("@nestjs/common");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const qdrant_provider_1 = require("./qdrant.provider");
let QdrantService = QdrantService_1 = class QdrantService {
    client;
    logger = new common_1.Logger(QdrantService_1.name);
    constructor(client) {
        this.client = client;
    }
    async createCollection(collectionName, vectorSize = 1536) {
        try {
            const result = await this.client.collectionExists(collectionName);
            if (!result.exists) {
                await this.client.createCollection(collectionName, {
                    vectors: {
                        size: vectorSize,
                        distance: 'Cosine',
                    },
                });
                this.logger.log(`Created Qdrant collection: '${collectionName}'`);
            }
        }
        catch (err) {
            this.logger.error(`Failed to create Qdrant collection '${collectionName}':`, err);
            throw err;
        }
    }
    async upsertDocuments(collectionName, points) {
        try {
            await this.createCollection(collectionName, points[0]?.vector?.length || 1536);
            await this.client.upsert(collectionName, {
                wait: true,
                points: points.map((p) => ({
                    id: p.id,
                    vector: p.vector,
                    payload: p.payload,
                })),
            });
        }
        catch (err) {
            this.logger.error(`Failed to upsert points in collection '${collectionName}':`, err);
            throw err;
        }
    }
    async searchDocuments(collectionName, vector, limit = 5) {
        try {
            const result = await this.client.collectionExists(collectionName);
            if (!result.exists)
                return [];
            const results = await this.client.search(collectionName, {
                vector: vector,
                limit: limit,
                with_payload: true,
            });
            return results;
        }
        catch (err) {
            this.logger.error(`Failed search on collection '${collectionName}':`, err);
            throw err;
        }
    }
    async deleteDocuments(collectionName, ids) {
        try {
            const result = await this.client.collectionExists(collectionName);
            if (!result.exists)
                return;
            await this.client.delete(collectionName, {
                points: ids,
            });
        }
        catch (err) {
            this.logger.error(`Failed to delete points from collection '${collectionName}':`, err);
            throw err;
        }
    }
    async checkHealth() {
        try {
            const response = await this.client.getCollections();
            return !!response.collections;
        }
        catch (err) {
            this.logger.error('Qdrant health check failed:', err);
            return false;
        }
    }
};
exports.QdrantService = QdrantService;
exports.QdrantService = QdrantService = QdrantService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(qdrant_provider_1.QDRANT_CLIENT)),
    __metadata("design:paramtypes", [js_client_rest_1.QdrantClient])
], QdrantService);
//# sourceMappingURL=qdrant.service.js.map
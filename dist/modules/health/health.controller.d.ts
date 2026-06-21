import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { StorageService } from '../../storage/storage.service';
import { QdrantService } from '../../qdrant/qdrant.service';
export declare class HealthController {
    private readonly prisma;
    private readonly cacheService;
    private readonly storageService;
    private readonly qdrantService;
    constructor(prisma: PrismaService, cacheService: CacheService, storageService: StorageService, qdrantService: QdrantService);
    private checkDatabase;
    checkAll(): Promise<{
        database: string;
        redis: string;
        storage: string;
        qdrant: string;
        api: string;
    }>;
    checkDb(): Promise<{
        status: string;
    }>;
    checkRedis(): Promise<{
        status: string;
        redis: string;
    }>;
    checkStorage(): Promise<{
        status: string;
    }>;
    checkQdrant(): Promise<{
        status: string;
    }>;
}

import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { StorageService } from '../../storage/storage.service';
import { QdrantService } from '../../qdrant/qdrant.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
    private readonly qdrantService: QdrantService,
  ) {}

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  @Get()
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

  @Get('database')
  async checkDb() {
    const healthy = await this.checkDatabase();
    return { status: healthy ? 'ok' : 'error' };
  }

  @Get('redis')
  async checkRedis() {
    const healthy = await this.cacheService.checkHealth();
    return { status: healthy ? 'ok' : 'error', redis: healthy ? 'PONG' : 'ERROR' };
  }

  @Get('storage')
  async checkStorage() {
    const healthy = await this.storageService.checkHealth();
    return { status: healthy ? 'ok' : 'error' };
  }

  @Get('qdrant')
  async checkQdrant() {
    const healthy = await this.qdrantService.checkHealth();
    return { status: healthy ? 'ok' : 'error' };
  }
}

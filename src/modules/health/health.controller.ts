import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
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

  private async report() {
    const [database, redis, storage, qdrant] = await Promise.all([
      this.checkDatabase(),
      this.cacheService.checkHealth(),
      this.storageService.checkHealth(),
      this.qdrantService.checkHealth(),
    ]);
    return { database, redis, storage, qdrant };
  }

  @Get('live')
  live() {
    return { status: 'ok', api: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks = await this.report();
    const data = {
      status: Object.values(checks).every(Boolean) ? 'ok' : 'error',
      ...Object.fromEntries(
        Object.entries(checks).map(([key, value]) => [
          key,
          value ? 'ok' : 'error',
        ]),
      ),
      api: 'ok',
    };
    if (data.status !== 'ok') {
      throw new ServiceUnavailableException(data);
    }
    return data;
  }

  @Get()
  async checkAll() {
    const checks = await this.report();

    return {
      database: checks.database ? 'ok' : 'error',
      redis: checks.redis ? 'ok' : 'error',
      storage: checks.storage ? 'ok' : 'error',
      qdrant: checks.qdrant ? 'ok' : 'error',
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
    return {
      status: healthy ? 'ok' : 'error',
      redis: healthy ? 'PONG' : 'ERROR',
    };
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

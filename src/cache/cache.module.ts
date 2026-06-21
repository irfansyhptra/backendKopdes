import { Module, Global } from '@nestjs/common';
import { RedisProvider } from './redis.provider';
import { CacheService } from './cache.service';

@Global()
@Module({
  providers: [RedisProvider, CacheService],
  exports: [CacheService],
})
export class CacheModule {}

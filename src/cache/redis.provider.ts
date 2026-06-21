import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) => {
    const redisUrl =
      configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
    });

    client.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    return client;
  },
  inject: [ConfigService],
};

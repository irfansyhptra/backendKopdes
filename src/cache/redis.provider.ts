import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) => {
    let redisUrl =
      configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    // Parse and clean redis-cli wrapper syntax if present
    if (redisUrl.includes('-u ')) {
      redisUrl = redisUrl.split('-u ')[1].trim();
    }
    redisUrl = redisUrl.replace(/^['"]|['"]$/g, '');

    const isUpstash = redisUrl.includes('upstash.io');
    const connectionOptions: any = {
      maxRetriesPerRequest: 3,
      // Connection pooling defaults in ioredis
      enableReadyCheck: true,
    };

    // Apply TLS configurations for Upstash or secure Redis protocol
    if (isUpstash || redisUrl.startsWith('rediss://')) {
      connectionOptions.tls = {
        rejectUnauthorized: false, // Bypass self-signed certification blocks
      };
      if (redisUrl.startsWith('redis://')) {
        redisUrl = redisUrl.replace('redis://', 'rediss://');
      }
    }

    const client = new Redis(redisUrl, connectionOptions);

    client.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    return client;
  },
  inject: [ConfigService],
};

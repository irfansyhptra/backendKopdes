import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

@Injectable()
export class CacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redisClient.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.redisClient.set(key, stringValue, 'EX', ttlSeconds);
    } else {
      await this.redisClient.set(key, stringValue);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.redisClient.exists(key);
    return count > 0;
  }

  async ttl(key: string): Promise<number> {
    return this.redisClient.ttl(key);
  }

  async increment(key: string, value = 1): Promise<number> {
    return this.redisClient.incrby(key, value);
  }

  async deletePattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redisClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = newCursor;
      if (keys && keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } while (cursor !== '0');
  }

  async checkHealth(): Promise<boolean> {
    try {
      const ping = await this.redisClient.ping();
      return ping === 'PONG';
    } catch {
      return false;
    }
  }
}

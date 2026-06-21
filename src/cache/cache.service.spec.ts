import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheModule } from './cache.module';
import { CacheService } from './cache.service';
import { validate } from '../config/env.validation';

describe('CacheService', () => {
  let service: CacheService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate,
        }),
        CacheModule,
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  afterAll(async () => {
    if (module) {
      const redis = module.get<Redis>('REDIS_CLIENT');
      await redis.quit();
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should set, get, exists, and delete cache keys', async () => {
    const key = 'test:key';
    const value = { hello: 'world' };

    await service.set(key, value);
    const exists = await service.exists(key);
    expect(exists).toBe(true);

    const cachedValue = await service.get(key);
    expect(cachedValue).toEqual(value);

    await service.delete(key);
    const existsAfterDelete = await service.exists(key);
    expect(existsAfterDelete).toBe(false);
  });

  it('should support TTL and increment', async () => {
    const key = 'test:incr';
    await service.delete(key);

    const val = await service.increment(key);
    expect(val).toBe(1);

    const val2 = await service.increment(key, 5);
    expect(val2).toBe(6);

    await service.set(key, 'test', 10);
    const ttl = await service.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);

    await service.delete(key);
  });

  it('should invalidate keys by pattern', async () => {
    await service.set('product:1', 'apple');
    await service.set('product:2', 'banana');
    await service.set('category:list', 'fruits');

    await service.deletePattern('product:*');

    const p1 = await service.get('product:1');
    const p2 = await service.get('product:2');
    const cat = await service.get('category:list');

    expect(p1).toBeNull();
    expect(p2).toBeNull();
    expect(cat).toBe('fruits');

    await service.delete('category:list');
  });

  it('should pass health check', async () => {
    const healthy = await service.checkHealth();
    expect(healthy).toBe(true);
  });
});

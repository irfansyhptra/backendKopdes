import { Redis } from 'ioredis';
export declare class CacheService {
    private readonly redisClient;
    constructor(redisClient: Redis);
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    ttl(key: string): Promise<number>;
    increment(key: string, value?: number): Promise<number>;
    deletePattern(pattern: string): Promise<void>;
    checkHealth(): Promise<boolean>;
}

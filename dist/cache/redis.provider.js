"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisProvider = exports.REDIS_CLIENT = void 0;
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
exports.REDIS_CLIENT = 'REDIS_CLIENT';
exports.RedisProvider = {
    provide: exports.REDIS_CLIENT,
    useFactory: (configService) => {
        const redisUrl = configService.get('REDIS_URL') || 'redis://localhost:6379';
        const client = new ioredis_1.Redis(redisUrl, {
            maxRetriesPerRequest: 3,
        });
        client.on('error', (err) => {
            console.error('Redis connection error:', err);
        });
        return client;
    },
    inject: [config_1.ConfigService],
};
//# sourceMappingURL=redis.provider.js.map
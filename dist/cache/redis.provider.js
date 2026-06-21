"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisProvider = exports.REDIS_CLIENT = void 0;
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
exports.REDIS_CLIENT = 'REDIS_CLIENT';
exports.RedisProvider = {
    provide: exports.REDIS_CLIENT,
    useFactory: (configService) => {
        let redisUrl = configService.get('REDIS_URL') || 'redis://localhost:6379';
        if (redisUrl.includes('-u ')) {
            redisUrl = redisUrl.split('-u ')[1].trim();
        }
        redisUrl = redisUrl.replace(/^['"]|['"]$/g, '');
        const isUpstash = redisUrl.includes('upstash.io');
        const connectionOptions = {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
        };
        if (isUpstash || redisUrl.startsWith('rediss://')) {
            connectionOptions.tls = {
                rejectUnauthorized: false,
            };
            if (redisUrl.startsWith('redis://')) {
                redisUrl = redisUrl.replace('redis://', 'rediss://');
            }
        }
        const client = new ioredis_1.Redis(redisUrl, connectionOptions);
        client.on('error', (err) => {
            console.error('Redis connection error:', err);
        });
        return client;
    },
    inject: [config_1.ConfigService],
};
//# sourceMappingURL=redis.provider.js.map
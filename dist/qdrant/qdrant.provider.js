"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantProvider = exports.QDRANT_CLIENT = void 0;
const config_1 = require("@nestjs/config");
const js_client_rest_1 = require("@qdrant/js-client-rest");
exports.QDRANT_CLIENT = 'QDRANT_CLIENT';
exports.QdrantProvider = {
    provide: exports.QDRANT_CLIENT,
    useFactory: (configService) => {
        const rawUrl = configService.get('QDRANT_URL') || '';
        const apiKey = configService.get('QDRANT_API_KEY');
        if (!rawUrl) {
            return new js_client_rest_1.QdrantClient({ url: 'http://localhost:6333' });
        }
        const cleanUrl = rawUrl.replace(/:6333\/?$/, '').replace(/\/$/, '');
        const isCloud = cleanUrl.includes('.cloud.qdrant.io') || cleanUrl.startsWith('https://');
        return new js_client_rest_1.QdrantClient({
            url: cleanUrl,
            apiKey: apiKey && !apiKey.startsWith('your-') ? apiKey : undefined,
            port: isCloud ? 443 : 6333,
        });
    },
    inject: [config_1.ConfigService],
};
//# sourceMappingURL=qdrant.provider.js.map
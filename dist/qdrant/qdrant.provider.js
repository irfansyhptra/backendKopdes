"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantProvider = exports.QDRANT_CLIENT = void 0;
const config_1 = require("@nestjs/config");
const js_client_rest_1 = require("@qdrant/js-client-rest");
exports.QDRANT_CLIENT = 'QDRANT_CLIENT';
exports.QdrantProvider = {
    provide: exports.QDRANT_CLIENT,
    useFactory: (configService) => {
        const url = configService.get('QDRANT_URL');
        const apiKey = configService.get('QDRANT_API_KEY');
        return new js_client_rest_1.QdrantClient({
            url,
            apiKey,
        });
    },
    inject: [config_1.ConfigService],
};
//# sourceMappingURL=qdrant.provider.js.map
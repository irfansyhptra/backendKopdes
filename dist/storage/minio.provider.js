"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinioProvider = exports.MINIO_CLIENT = void 0;
const config_1 = require("@nestjs/config");
const Minio = __importStar(require("minio"));
exports.MINIO_CLIENT = 'MINIO_CLIENT';
exports.MinioProvider = {
    provide: exports.MINIO_CLIENT,
    useFactory: (configService) => {
        const endPoint = configService.get('MINIO_ENDPOINT') || 'localhost';
        const port = Number(configService.get('MINIO_PORT') || '9000');
        const useSSL = configService.get('MINIO_USE_SSL') === 'true';
        const accessKey = configService.get('MINIO_ACCESS_KEY') || 'admin';
        const secretKey = configService.get('MINIO_SECRET_KEY') || 'adminpassword';
        return new Minio.Client({
            endPoint,
            port,
            useSSL,
            accessKey,
            secretKey,
        });
    },
    inject: [config_1.ConfigService],
};
//# sourceMappingURL=minio.provider.js.map
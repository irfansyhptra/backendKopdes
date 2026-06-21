declare enum Environment {
    Development = "development",
    Production = "production",
    Test = "test"
}
declare class EnvironmentVariables {
    NODE_ENV: Environment;
    PORT: number;
    DATABASE_URL: string;
    REDIS_URL: string;
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    REFRESH_TOKEN_EXPIRES_IN: string;
    MINIO_ENDPOINT: string;
    MINIO_PORT: number;
    MINIO_ACCESS_KEY: string;
    MINIO_SECRET_KEY: string;
    MINIO_BUCKET: string;
    QDRANT_URL: string;
    QDRANT_API_KEY?: string;
    GOOGLE_API_KEY?: string;
    OPENAI_API_KEY?: string;
    SMTP_HOST?: string;
    SMTP_PORT?: number;
    SMTP_USER?: string;
    SMTP_PASS?: string;
    SENTRY_DSN?: string;
    QRIS_MERCHANT_ID?: string;
    QRIS_API_KEY?: string;
}
export declare function validate(config: Record<string, unknown>): EnvironmentVariables;
export {};

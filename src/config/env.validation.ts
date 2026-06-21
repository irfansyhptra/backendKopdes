import { plainToInstance } from 'class-transformer';
import {
  validateSync,
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN = '15m';

  @IsString()
  @IsOptional()
  REFRESH_TOKEN_EXPIRES_IN = '7d';

  @IsString()
  SUPABASE_URL!: string;

  @IsString()
  SUPABASE_ANON_KEY!: string;

  @IsString()
  SUPABASE_SERVICE_ROLE_KEY!: string;

  @IsString()
  QDRANT_URL!: string;

  @IsString()
  @IsOptional()
  QDRANT_API_KEY?: string;

  @IsString()
  @IsOptional()
  GOOGLE_API_KEY?: string;

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsNumber()
  @Min(0)
  @Max(65535)
  @IsOptional()
  SMTP_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  @IsString()
  @IsOptional()
  QRIS_MERCHANT_ID?: string;

  @IsString()
  @IsOptional()
  QRIS_API_KEY?: string;
}

export function validate(config: Record<string, unknown>) {
  const convertedConfig = { ...config };
  if (convertedConfig['PORT']) {
    convertedConfig['PORT'] = Number(convertedConfig['PORT']);
  }
  if (convertedConfig['SMTP_PORT']) {
    convertedConfig['SMTP_PORT'] = Number(convertedConfig['SMTP_PORT']);
  }

  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    convertedConfig,
    { enableImplicitConversion: true },
  );

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Config validation error: ${errors.toString()}`);
  }
  return validatedConfig;
}

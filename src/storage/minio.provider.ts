import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

export const MINIO_CLIENT = 'MINIO_CLIENT';

export const MinioProvider: Provider = {
  provide: MINIO_CLIENT,
  useFactory: (configService: ConfigService) => {
    const endPoint = configService.get<string>('MINIO_ENDPOINT') || 'localhost';
    const port = Number(configService.get<string>('MINIO_PORT') || '9000');
    const useSSL = configService.get<string>('MINIO_USE_SSL') === 'true';
    const accessKey = configService.get<string>('MINIO_ACCESS_KEY') || 'admin';
    const secretKey =
      configService.get<string>('MINIO_SECRET_KEY') || 'adminpassword';

    return new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });
  },
  inject: [ConfigService],
};

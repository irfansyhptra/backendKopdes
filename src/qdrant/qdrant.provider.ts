import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export const QDRANT_CLIENT = 'QDRANT_CLIENT';

export const QdrantProvider: Provider = {
  provide: QDRANT_CLIENT,
  useFactory: (configService: ConfigService) => {
    const url = configService.get<string>('QDRANT_URL');
    const apiKey = configService.get<string>('QDRANT_API_KEY');

    return new QdrantClient({
      url,
      apiKey,
    });
  },
  inject: [ConfigService],
};

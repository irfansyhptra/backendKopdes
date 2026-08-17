import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export const QDRANT_CLIENT = 'QDRANT_CLIENT';

export const QdrantProvider: Provider = {
  provide: QDRANT_CLIENT,
  useFactory: (configService: ConfigService) => {
    const rawUrl = configService.get<string>('QDRANT_URL') || '';
    const apiKey = configService.get<string>('QDRANT_API_KEY');

    if (!rawUrl) {
      return new QdrantClient({ url: 'http://localhost:6333' });
    }

    // Clean trailing slashes & port 6333 if present on HTTPS cloud URLs
    const cleanUrl = rawUrl.replace(/:6333\/?$/, '').replace(/\/$/, '');
    const isCloud = cleanUrl.includes('.cloud.qdrant.io') || cleanUrl.startsWith('https://');

    return new QdrantClient({
      url: cleanUrl,
      apiKey: apiKey && !apiKey.startsWith('your-') ? apiKey : undefined,
      port: isCloud ? 443 : 6333,
    });
  },
  inject: [ConfigService],
};


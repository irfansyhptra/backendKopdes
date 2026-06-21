import { Injectable, Inject, Logger } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_CLIENT } from './qdrant.provider';

@Injectable()
export class QdrantService {
  private readonly logger = new Logger(QdrantService.name);

  constructor(@Inject(QDRANT_CLIENT) private readonly client: QdrantClient) {}

  async createCollection(collectionName: string, vectorSize = 1536): Promise<void> {
    try {
      const result = await this.client.collectionExists(collectionName);
      if (!result.exists) {
        await this.client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: 'Cosine',
          },
        });
        this.logger.log(`Created Qdrant collection: '${collectionName}'`);
      }
    } catch (err) {
      this.logger.error(`Failed to create Qdrant collection '${collectionName}':`, err);
      throw err;
    }
  }

  async upsertDocuments(collectionName: string, points: Array<{ id: string; vector: number[]; payload: any }>): Promise<void> {
    try {
      await this.createCollection(collectionName, points[0]?.vector?.length || 1536);
      await this.client.upsert(collectionName, {
        wait: true,
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      });
    } catch (err) {
      this.logger.error(`Failed to upsert points in collection '${collectionName}':`, err);
      throw err;
    }
  }

  async searchDocuments(collectionName: string, vector: number[], limit = 5): Promise<any[]> {
    try {
      const result = await this.client.collectionExists(collectionName);
      if (!result.exists) return [];

      const results = await this.client.search(collectionName, {
        vector: vector,
        limit: limit,
        with_payload: true,
      });
      return results;
    } catch (err) {
      this.logger.error(`Failed search on collection '${collectionName}':`, err);
      throw err;
    }
  }

  async deleteDocuments(collectionName: string, ids: string[]): Promise<void> {
    try {
      const result = await this.client.collectionExists(collectionName);
      if (!result.exists) return;

      await this.client.delete(collectionName, {
        points: ids,
      });
    } catch (err) {
      this.logger.error(`Failed to delete points from collection '${collectionName}':`, err);
      throw err;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.getCollections();
      return !!response.collections;
    } catch (err) {
      this.logger.error('Qdrant health check failed:', err);
      return false;
    }
  }
}

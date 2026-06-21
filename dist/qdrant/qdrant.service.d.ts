import { QdrantClient } from '@qdrant/js-client-rest';
export declare class QdrantService {
    private readonly client;
    private readonly logger;
    constructor(client: QdrantClient);
    createCollection(collectionName: string, vectorSize?: number): Promise<void>;
    upsertDocuments(collectionName: string, points: Array<{
        id: string;
        vector: number[];
        payload: any;
    }>): Promise<void>;
    searchDocuments(collectionName: string, vector: number[], limit?: number): Promise<any[]>;
    deleteDocuments(collectionName: string, ids: string[]): Promise<void>;
    checkHealth(): Promise<boolean>;
}

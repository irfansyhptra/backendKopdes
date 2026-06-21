import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { QdrantService } from '../../qdrant/qdrant.service';
export declare class AIService {
    private readonly prisma;
    private readonly qdrantService;
    private readonly configService;
    private readonly logger;
    private readonly collectionName;
    constructor(prisma: PrismaService, qdrantService: QdrantService, configService: ConfigService);
    private getGenAI;
    getEmbedding(text: string): Promise<number[]>;
    private generateLLMResponse;
    chatCooperative(message: string): Promise<string>;
    chatManagement(message: string): Promise<string>;
    analyzeCommunityDemands(): Promise<string>;
    getInventoryReplenishmentOptions(): Promise<string>;
    detectInventoryAnomalies(): Promise<string>;
    seedKnowledgeBase(): Promise<void>;
    private generateUUID;
}

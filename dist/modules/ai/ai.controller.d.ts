import { AIService } from './ai.service';
export declare class AIController {
    private readonly aiService;
    constructor(aiService: AIService);
    chatCooperative(message: string): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: string;
        error?: undefined;
    }>;
    chatManagement(message: string): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: string;
        error?: undefined;
    }>;
    analyzeCommunityDemands(): Promise<{
        success: boolean;
        data: string;
    }>;
    getInventoryReplenishmentOptions(): Promise<{
        success: boolean;
        data: string;
    }>;
    detectInventoryAnomalies(): Promise<{
        success: boolean;
        data: string;
    }>;
    seedKnowledgeBase(): Promise<{
        success: boolean;
        message: string;
    }>;
}

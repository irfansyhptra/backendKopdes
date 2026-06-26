import { AIService } from './ai.service';
export declare class AIController {
    private readonly aiService;
    private readonly logger;
    constructor(aiService: AIService);
    chatCooperative(message: string): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
        response?: undefined;
    } | {
        success: boolean;
        data: string;
        response: string;
        error?: undefined;
    }>;
    chatManagement(message: string): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
        response?: undefined;
    } | {
        success: boolean;
        data: string;
        response: string;
        error?: undefined;
    }>;
    analyzeCommunityDemands(): Promise<{
        success: boolean;
        data: string;
        response: string;
    }>;
    getInventoryReplenishmentOptions(): Promise<{
        success: boolean;
        data: string;
        response: string;
    }>;
    detectInventoryAnomalies(): Promise<{
        success: boolean;
        data: string;
        response: string;
    }>;
    seedKnowledgeBase(): Promise<{
        success: boolean;
        message: string;
    }>;
}

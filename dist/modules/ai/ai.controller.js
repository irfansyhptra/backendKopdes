"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AIController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIController = void 0;
const common_1 = require("@nestjs/common");
const ai_service_1 = require("./ai.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const client_1 = require("@prisma/client");
let AIController = AIController_1 = class AIController {
    aiService;
    logger = new common_1.Logger(AIController_1.name);
    constructor(aiService) {
        this.aiService = aiService;
    }
    async chatCooperative(message) {
        this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/chat. Message: "${message}"`);
        if (!message) {
            this.logger.warn(`🤖 AI CONTROLLER: Request validation failed. Message is empty.`);
            return { success: false, error: 'Message content is required' };
        }
        try {
            const response = await this.aiService.chatCooperative(message);
            this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/chat.`);
            return { success: true, data: response, response: response };
        }
        catch (err) {
            this.logger.error(`🤖 AI CONTROLLER: Error in /ai/chat: ${err.message}`, err.stack);
            throw err;
        }
    }
    async chatManagement(message) {
        this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/management. Message: "${message}"`);
        if (!message) {
            this.logger.warn(`🤖 AI CONTROLLER: Request validation failed. Message is empty.`);
            return { success: false, error: 'Message content is required' };
        }
        try {
            const response = await this.aiService.chatManagement(message);
            this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/management.`);
            return { success: true, data: response, response: response };
        }
        catch (err) {
            this.logger.error(`🤖 AI CONTROLLER: Error in /ai/management: ${err.message}`, err.stack);
            throw err;
        }
    }
    async analyzeCommunityDemands() {
        this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/community.`);
        try {
            const response = await this.aiService.analyzeCommunityDemands();
            this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/community.`);
            return { success: true, data: response, response: response };
        }
        catch (err) {
            this.logger.error(`🤖 AI CONTROLLER: Error in /ai/community: ${err.message}`, err.stack);
            throw err;
        }
    }
    async getInventoryReplenishmentOptions() {
        this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/inventory.`);
        try {
            const response = await this.aiService.getInventoryReplenishmentOptions();
            this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/inventory.`);
            return { success: true, data: response, response: response };
        }
        catch (err) {
            this.logger.error(`🤖 AI CONTROLLER: Error in /ai/inventory: ${err.message}`, err.stack);
            throw err;
        }
    }
    async detectInventoryAnomalies() {
        this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/anomaly.`);
        try {
            const response = await this.aiService.detectInventoryAnomalies();
            this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/anomaly.`);
            return { success: true, data: response, response: response };
        }
        catch (err) {
            this.logger.error(`🤖 AI CONTROLLER: Error in /ai/anomaly: ${err.message}`, err.stack);
            throw err;
        }
    }
    async seedKnowledgeBase() {
        this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/seed-knowledge.`);
        try {
            await this.aiService.seedKnowledgeBase();
            this.logger.log(`🤖 AI CONTROLLER: Success seeding knowledge base.`);
            return { success: true, message: 'Knowledge base seeded with base documents successfully!' };
        }
        catch (err) {
            this.logger.error(`🤖 AI CONTROLLER: Error in /ai/seed-knowledge: ${err.message}`, err.stack);
            throw err;
        }
    }
};
exports.AIController = AIController;
__decorate([
    (0, common_1.Post)('chat'),
    __param(0, (0, common_1.Body)('message')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "chatCooperative", null);
__decorate([
    (0, common_1.Post)('management'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN_KOPDES, client_1.Role.SUPER_ADMIN),
    __param(0, (0, common_1.Body)('message')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "chatManagement", null);
__decorate([
    (0, common_1.Post)('community'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN_KOPDES, client_1.Role.SUPER_ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AIController.prototype, "analyzeCommunityDemands", null);
__decorate([
    (0, common_1.Post)('inventory'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN_KOPDES, client_1.Role.SUPER_ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AIController.prototype, "getInventoryReplenishmentOptions", null);
__decorate([
    (0, common_1.Post)('anomaly'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN_KOPDES, client_1.Role.SUPER_ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AIController.prototype, "detectInventoryAnomalies", null);
__decorate([
    (0, common_1.Post)('seed-knowledge'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN_KOPDES, client_1.Role.SUPER_ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AIController.prototype, "seedKnowledgeBase", null);
exports.AIController = AIController = AIController_1 = __decorate([
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AIService])
], AIController);
//# sourceMappingURL=ai.controller.js.map
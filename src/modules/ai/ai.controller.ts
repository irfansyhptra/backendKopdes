import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('ai')
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(private readonly aiService: AIService) {}

  // 1. AI Cooperative Assistant: Public or any authenticated member
  @Post('chat')
  async chatCooperative(@Body('message') message: string) {
    this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/chat. Message: "${message}"`);
    if (!message) {
      this.logger.warn(`🤖 AI CONTROLLER: Request validation failed. Message is empty.`);
      return { success: false, error: 'Message content is required' };
    }
    try {
      const response = await this.aiService.chatCooperative(message);
      this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/chat.`);
      return { success: true, data: response, response: response };
    } catch (err: any) {
      this.logger.error(`🤖 AI CONTROLLER: Error in /ai/chat: ${err.message}`, err.stack);
      throw err;
    }
  }

  // 2. AI Management Assistant: Restricted to Admins & Super Admins
  @Post('management')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async chatManagement(@Body('message') message: string) {
    this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/management. Message: "${message}"`);
    if (!message) {
      this.logger.warn(`🤖 AI CONTROLLER: Request validation failed. Message is empty.`);
      return { success: false, error: 'Message content is required' };
    }
    try {
      const response = await this.aiService.chatManagement(message);
      this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/management.`);
      return { success: true, data: response, response: response };
    } catch (err: any) {
      this.logger.error(`🤖 AI CONTROLLER: Error in /ai/management: ${err.message}`, err.stack);
      throw err;
    }
  }

  // 3. Community Demand Intelligence: Restricted to Admins & Super Admins
  @Post('community')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async analyzeCommunityDemands() {
    this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/community.`);
    try {
      const response = await this.aiService.analyzeCommunityDemands();
      this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/community.`);
      return { success: true, data: response, response: response };
    } catch (err: any) {
      this.logger.error(`🤖 AI CONTROLLER: Error in /ai/community: ${err.message}`, err.stack);
      throw err;
    }
  }

  // 4. Inventory Intelligence: Restricted to Admins & Super Admins
  @Post('inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async getInventoryReplenishmentOptions() {
    this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/inventory.`);
    try {
      const response = await this.aiService.getInventoryReplenishmentOptions();
      this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/inventory.`);
      return { success: true, data: response, response: response };
    } catch (err: any) {
      this.logger.error(`🤖 AI CONTROLLER: Error in /ai/inventory: ${err.message}`, err.stack);
      throw err;
    }
  }

  // 5. Inventory Anomaly Detection: Restricted to Admins & Super Admins
  @Post('anomaly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async detectInventoryAnomalies() {
    this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/anomaly.`);
    try {
      const response = await this.aiService.detectInventoryAnomalies();
      this.logger.log(`🤖 AI CONTROLLER: Success response generated for /ai/anomaly.`);
      return { success: true, data: response, response: response };
    } catch (err: any) {
      this.logger.error(`🤖 AI CONTROLLER: Error in /ai/anomaly: ${err.message}`, err.stack);
      throw err;
    }
  }

  // Debug/Admin utility to seed standard RAG documents in Qdrant
  @Post('seed-knowledge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async seedKnowledgeBase() {
    this.logger.log(`🤖 AI CONTROLLER: Incoming Request POST /ai/seed-knowledge.`);
    try {
      await this.aiService.seedKnowledgeBase();
      this.logger.log(`🤖 AI CONTROLLER: Success seeding knowledge base.`);
      return { success: true, message: 'Knowledge base seeded with base documents successfully!' };
    } catch (err: any) {
      this.logger.error(`🤖 AI CONTROLLER: Error in /ai/seed-knowledge: ${err.message}`, err.stack);
      throw err;
    }
  }
}

import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('ai')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  // 1. AI Cooperative Assistant: Public or any authenticated member
  @Post('chat')
  async chatCooperative(@Body('message') message: string) {
    if (!message) {
      return { success: false, error: 'Message content is required' };
    }
    const response = await this.aiService.chatCooperative(message);
    return { success: true, data: response };
  }

  // 2. AI Management Assistant: Restricted to Admins & Super Admins
  @Post('management')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async chatManagement(@Body('message') message: string) {
    if (!message) {
      return { success: false, error: 'Message content is required' };
    }
    const response = await this.aiService.chatManagement(message);
    return { success: true, data: response };
  }

  // 3. Community Demand Intelligence: Restricted to Admins & Super Admins
  @Post('community')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async analyzeCommunityDemands() {
    const response = await this.aiService.analyzeCommunityDemands();
    return { success: true, data: response };
  }

  // 4. Inventory Intelligence: Restricted to Admins & Super Admins
  @Post('inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async getInventoryReplenishmentOptions() {
    const response = await this.aiService.getInventoryReplenishmentOptions();
    return { success: true, data: response };
  }

  // 5. Inventory Anomaly Detection: Restricted to Admins & Super Admins
  @Post('anomaly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async detectInventoryAnomalies() {
    const response = await this.aiService.detectInventoryAnomalies();
    return { success: true, data: response };
  }

  // Debug/Admin utility to seed standard RAG documents in Qdrant
  @Post('seed-knowledge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  async seedKnowledgeBase() {
    await this.aiService.seedKnowledgeBase();
    return { success: true, message: 'Knowledge base seeded with base documents successfully!' };
  }
}

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Customer creates a new product suggestion
  async createSuggestion(
    userId: string,
    productName: string,
    category: string,
    description?: string,
  ) {
    const suggestion = await this.prisma.communitySuggestion.create({
      data: {
        userId,
        productName,
        category,
        description,
      },
      include: {
        user: { select: { id: true, name: true } },
        supporters: true,
      },
    });

    // Auto-add creator as initial supporter
    await this.prisma.communitySuggestionSupport.create({
      data: {
        suggestionId: suggestion.id,
        userId,
      },
    });

    return this.getSuggestionById(suggestion.id, userId);
  }

  // 2. List all community suggestions with total support counts
  async getSuggestions(userId?: string) {
    const suggestions = await this.prisma.communitySuggestion.findMany({
      include: {
        user: { select: { id: true, name: true } },
        supporters: { select: { userId: true } },
      },
      orderBy: { supporters: { _count: 'desc' } },
    });

    return suggestions.map((s) => ({
      id: s.id,
      productName: s.productName,
      category: s.category,
      description: s.description,
      creator: s.user.name,
      totalSupports: s.supporters.length,
      isSupportedByMe: userId ? s.supporters.some((sup) => sup.userId === userId) : false,
      createdAt: s.createdAt,
    }));
  }

  // 3. Get single suggestion by ID
  async getSuggestionById(id: string, userId?: string) {
    const s = await this.prisma.communitySuggestion.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        supporters: { select: { userId: true } },
      },
    });

    if (!s) {
      throw new NotFoundException('Usulan tidak ditemukan');
    }

    return {
      id: s.id,
      productName: s.productName,
      category: s.category,
      description: s.description,
      creator: s.user.name,
      totalSupports: s.supporters.length,
      isSupportedByMe: userId ? s.supporters.some((sup) => sup.userId === userId) : false,
      createdAt: s.createdAt,
    };
  }

  // 4. Toggle support/vote for a suggestion
  async toggleSupport(suggestionId: string, userId: string) {
    const suggestion = await this.prisma.communitySuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new NotFoundException('Usulan tidak ditemukan');
    }

    const existingSupport = await this.prisma.communitySuggestionSupport.findUnique({
      where: {
        suggestionId_userId: {
          suggestionId,
          userId,
        },
      },
    });

    if (existingSupport) {
      // Remove support (un-vote)
      await this.prisma.communitySuggestionSupport.delete({
        where: { id: existingSupport.id },
      });
    } else {
      // Add support (vote)
      await this.prisma.communitySuggestionSupport.create({
        data: {
          suggestionId,
          userId,
        },
      });
    }

    return this.getSuggestionById(suggestionId, userId);
  }
}

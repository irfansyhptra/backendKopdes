import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CommunityService } from './community.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // 1. View all suggestions from village members
  @Get('suggestions')
  async getSuggestions(@Req() req: any) {
    const userId = req.user?.id;
    const data = await this.communityService.getSuggestions(userId);
    return { success: true, data };
  }

  // 2. Submit a new suggestion (Aspirasi Warga)
  @Post('suggestions')
  @UseGuards(JwtAuthGuard)
  async createSuggestion(
    @Req() req: any,
    @Body('productName') productName: string,
    @Body('category') category: string,
    @Body('description') description?: string,
  ) {
    if (!productName || !category) {
      throw new BadRequestException('Nama produk dan kategori wajib diisi');
    }
    const userId = req.user.id;
    const data = await this.communityService.createSuggestion(
      userId,
      productName,
      category,
      description,
    );
    return {
      success: true,
      message: 'Aspirasi produk berhasil diusulkan',
      data,
    };
  }

  // 3. Toggle support / vote for a suggestion
  @Post('suggestions/:id/support')
  @UseGuards(JwtAuthGuard)
  async toggleSupport(@Req() req: any, @Param('id') suggestionId: string) {
    const userId = req.user.id;
    const data = await this.communityService.toggleSupport(suggestionId, userId);
    return {
      success: true,
      message: data.isSupportedByMe ? 'Dukungan berhasil ditambahkan' : 'Dukungan berhasil dibatalkan',
      data,
    };
  }
}

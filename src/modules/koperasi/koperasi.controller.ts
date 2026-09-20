import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KoperasiService } from './koperasi.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { KoperasiQueryDto } from './dto/koperasi-query.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';

@Controller('koperasi')
export class KoperasiController {
  constructor(private readonly koperasiService: KoperasiService) {}

  /**
   * Publik: beranda memanggil ini sebelum pengguna login sekalipun.
   * `nearby` didaftarkan sebelum `:id` supaya tidak tertangkap sebagai id.
   */
  @Get('nearby')
  async findNearby(@Query() query: NearbyQueryDto) {
    const data = await this.koperasiService.findNearby(query);
    return { success: true, data };
  }

  @Get()
  async findAll(@Query() query: KoperasiQueryDto) {
    const data = await this.koperasiService.findAll(query);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.koperasiService.findOne(id);
    return { success: true, data };
  }

  @Get(':id/reviews')
  async findReviews(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.koperasiService.findReviews(
      id,
      Number(page) || 1,
      Number(limit) || 10,
    );
    return { success: true, data };
  }

  /// Rating pada card berasal dari sini. Wajib login supaya satu pengguna
  /// hanya bisa menilai sekali per Kopdes.
  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  async createReview(
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
    @Req() req: any,
  ) {
    const data = await this.koperasiService.upsertReview(
      id,
      req.user.id,
      dto.rating,
      dto.comment,
    );
    return { success: true, data };
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { ReviewService } from './review.service';
import { CreateReviewDto, ListReviewQueryDto } from './dto/review.dto';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  /// Daftar ulasan sebuah produk — terbuka, dibaca pembeli sebelum memutuskan.
  @Get()
  async list(@Query() query: ListReviewQueryDto) {
    const data = await this.reviews.list(query);
    return { success: true, ...data };
  }

  @Get('reviewable/:orderId')
  @UseGuards(JwtAuthGuard)
  async reviewable(
    @Req() req: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    const data = await this.reviews.reviewableItems(req.user.id, orderId);
    return { success: true, ...data };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateReviewDto) {
    const data = await this.reviews.create(req.user.id, dto);
    return { success: true, message: 'Ulasan tersimpan', data };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
  ) {
    const data = await this.reviews.update(
      req.user.id,
      id,
      dto.rating,
      dto.comment,
    );
    return { success: true, message: 'Ulasan diperbarui', data };
  }
}

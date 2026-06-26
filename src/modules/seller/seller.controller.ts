import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SellerService } from './seller.service';
import { CreateSellerProductDto } from './dto/create-seller-product.dto';
import { UpdateSellerProductDto } from './dto/update-seller-product.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, OrderStatus } from '@prisma/client';

@Controller('seller')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.UMKM)
export class SellerController {
  constructor(private readonly sellerService: SellerService) {}

  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    const data = await this.sellerService.getDashboard(req.user.id);
    return { success: true, data };
  }

  @Get('profile')
  async getProfile(@Req() req: any) {
    const data = await this.sellerService.getProfile(req.user.id);
    return { success: true, data };
  }

  @Put('profile')
  async updateProfile(@Req() req: any, @Body() dto: UpdateSellerProfileDto) {
    const data = await this.sellerService.updateProfile(req.user.id, dto);
    return { success: true, data };
  }

  @Get('products')
  async getProducts(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.sellerService.getProducts(req.user.id, {
      search,
      categoryId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { success: true, data };
  }

  @Post('products')
  @UseInterceptors(FilesInterceptor('images', 5))
  async createProduct(
    @Req() req: any,
    @Body() dto: CreateSellerProductDto,
    @UploadedFiles() files?: any[],
  ) {
    const data = await this.sellerService.createProduct(req.user.id, dto, files);
    return { success: true, data };
  }

  @Put('products/:id')
  @UseInterceptors(FilesInterceptor('images', 5))
  async updateProduct(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSellerProductDto,
    @UploadedFiles() files?: any[],
  ) {
    const data = await this.sellerService.updateProduct(req.user.id, id, dto, files);
    return { success: true, data };
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProduct(@Req() req: any, @Param('id') id: string) {
    await this.sellerService.deleteProduct(req.user.id, id);
    return { success: true };
  }

  @Get('orders')
  async getOrders(@Req() req: any) {
    const data = await this.sellerService.getOrders(req.user.id);
    return { success: true, data };
  }

  @Get('orders/:id')
  async getOrderDetail(@Req() req: any, @Param('id') id: string) {
    const data = await this.sellerService.getOrderDetail(req.user.id, id);
    return { success: true, data };
  }

  @Put('orders/:id/status')
  async updateOrderStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body('status') status: OrderStatus,
  ) {
    const data = await this.sellerService.updateOrderStatus(req.user.id, id, status);
    return { success: true, data };
  }

  @Get('statistics')
  async getStatistics(@Req() req: any) {
    const data = await this.sellerService.getStatistics(req.user.id);
    return { success: true, data };
  }
}

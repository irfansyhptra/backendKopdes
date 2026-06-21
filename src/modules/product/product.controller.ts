import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFiles, HttpCode, HttpStatus } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async findAll(@Query() query: ProductQueryDto) {
    const data = await this.productService.findAll(query);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.productService.findOne(id);
    return { success: true, data };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  @UseInterceptors(FilesInterceptor('images', 5)) // allow up to 5 images
  async create(
    @Body() dto: CreateProductDto,
    @UploadedFiles() files?: any[],
  ) {
    const data = await this.productService.create(dto, files);
    return { success: true, data };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  @UseInterceptors(FilesInterceptor('images', 5))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles() files?: any[],
  ) {
    const data = await this.productService.update(id, dto, files);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.productService.remove(id);
    return { success: true };
  }
}

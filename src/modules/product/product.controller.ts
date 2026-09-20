import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';
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

  // Pegawai boleh menambah barang; yang dibatasi baginya adalah menghapus,
  // bukan mengisi katalog.
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
  @RequirePermissions(Permission.PRODUCT_CREATE)
  @UseInterceptors(FilesInterceptor('images', 5)) // allow up to 5 images
  async create(
    @Req() req: any,
    @Body() dto: CreateProductDto,
    @UploadedFiles() files?: any[],
  ) {
    const data = await this.productService.create(dto, files, {
      id: req.user.id,
      kopdesId: req.user.kopdesId ?? null,
    });
    return { success: true, data };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
  @RequirePermissions(Permission.PRODUCT_UPDATE)
  @UseInterceptors(FilesInterceptor('images', 5))
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles() files?: any[],
  ) {
    const data = await this.productService.update(id, dto, files, {
      id: req.user.id,
      kopdesId: req.user.kopdesId ?? null,
    });
    return { success: true, data };
  }

  // Menonaktifkan barang menghapusnya dari etalase seluruh desa — keputusan
  // katalog, bukan pekerjaan harian. Pegawai tidak diberi PRODUCT_DELETE.
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
  @RequirePermissions(Permission.PRODUCT_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: any, @Param('id') id: string) {
    await this.productService.remove(id, {
      id: req.user.id,
      kopdesId: req.user.kopdesId ?? null,
    });
    return { success: true };
  }
}

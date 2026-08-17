import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { UmkmService } from './umkm.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { VerifyUmkmDto } from './dto/verify-umkm.dto';
import { TakedownProductDto } from './dto/takedown-product.dto';
import {
  ListUmkmQueryDto,
  ListUmkmProductQueryDto,
} from './dto/list-umkm-query.dto';

// Semua endpoint di bawah kontrol Admin Kopdes / Super Admin.
@Controller('admin/umkm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class UmkmController {
  constructor(private readonly umkmService: UmkmService) {}

  // ── Mitra ──
  @Get()
  async list(@Query() query: ListUmkmQueryDto) {
    const data = await this.umkmService.listUmkm(query);
    return { success: true, data };
  }

  // ── Produk UMKM (takedown) ──
  // Didaftarkan sebelum ':id' agar tidak tertangkap sebagai param.
  @Get('products')
  async listProducts(@Query() query: ListUmkmProductQueryDto) {
    const data = await this.umkmService.listUmkmProducts(query);
    return { success: true, data };
  }

  @Patch('products/:id/takedown')
  async takedown(@Param('id') id: string, @Body() dto: TakedownProductDto) {
    const data = await this.umkmService.takedownProduct(id, dto);
    return { success: true, data };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const data = await this.umkmService.getUmkm(id);
    return { success: true, data };
  }

  @Patch(':id/verify')
  async verify(@Param('id') id: string, @Body() dto: VerifyUmkmDto) {
    const data = await this.umkmService.verifyUmkm(id, dto);
    return { success: true, data };
  }
}

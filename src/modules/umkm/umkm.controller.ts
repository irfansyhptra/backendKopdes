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
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';
import { Role } from '@prisma/client';
import { VerifyUmkmDto } from './dto/verify-umkm.dto';
import { TakedownProductDto } from './dto/takedown-product.dto';
import { UpdateUmkmLocationDto } from './dto/update-umkm-location.dto';
import {
  ListUmkmQueryDto,
  ListUmkmProductQueryDto,
} from './dto/list-umkm-query.dto';

// Pegawai boleh melihat daftar mitra, tetapi keputusan atas mitra —
// verifikasi, takedown produk, penetapan lokasi — tetap milik Admin Kopdes.
@Controller('admin/umkm')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class UmkmController {
  constructor(private readonly umkmService: UmkmService) {}

  // ── Mitra ──
  @Get()
  @RequirePermissions(Permission.MITRA_READ)
  async list(@Query() query: ListUmkmQueryDto) {
    const data = await this.umkmService.listUmkm(query);
    return { success: true, data };
  }

  // ── Produk UMKM (takedown) ──
  // Didaftarkan sebelum ':id' agar tidak tertangkap sebagai param.
  @Get('products')
  @RequirePermissions(Permission.MITRA_READ)
  async listProducts(@Query() query: ListUmkmProductQueryDto) {
    const data = await this.umkmService.listUmkmProducts(query);
    return { success: true, data };
  }

  @Patch('products/:id/takedown')
  @RequirePermissions(Permission.UMKM_PRODUCT_TAKEDOWN)
  async takedown(@Param('id') id: string, @Body() dto: TakedownProductDto) {
    const data = await this.umkmService.takedownProduct(id, dto);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermissions(Permission.MITRA_READ)
  async detail(@Param('id') id: string) {
    const data = await this.umkmService.getUmkm(id);
    return { success: true, data };
  }

  @Patch(':id/verify')
  @RequirePermissions(Permission.MITRA_VERIFY)
  async verify(@Param('id') id: string, @Body() dto: VerifyUmkmDto) {
    const data = await this.umkmService.verifyUmkm(id, dto);
    return { success: true, data };
  }

  /**
   * Mengisi koordinat & profil lokasi Mitra UMKM.
   *
   * Tanpa ini, UMKM tidak akan pernah tampil di beranda customer karena
   * pencarian terdekat membuang baris tanpa koordinat.
   */
  @Patch(':id/location')
  @RequirePermissions(Permission.UMKM_LOCATION_UPDATE)
  async updateLocation(
    @Param('id') id: string,
    @Body() dto: UpdateUmkmLocationDto,
  ) {
    const data = await this.umkmService.updateLocation(id, dto);
    return { success: true, data };
  }
}

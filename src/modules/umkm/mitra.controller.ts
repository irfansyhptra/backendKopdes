import { Controller, Get, Param, Query } from '@nestjs/common';

import { MitraService } from './mitra.service';
import { MitraNearbyQueryDto } from './dto/mitra-nearby-query.dto';
import { MitraListQueryDto } from './dto/mitra-list-query.dto';

/**
 * Endpoint Mitra UMKM untuk pelanggan.
 *
 * Terpisah dari [UmkmController] yang berada di `admin/umkm` dan dikunci
 * RolesGuard — ini publik dan hanya menampilkan mitra berstatus ACTIVE.
 */
@Controller('umkm')
export class MitraController {
  constructor(private readonly mitraService: MitraService) {}

  /// Daftar mitra, biasanya disaring `kopdesId` oleh halaman Kopdes.
  /// Didaftarkan sebelum `:id` supaya tidak tertangkap sebagai id.
  @Get()
  async findAll(@Query() query: MitraListQueryDto) {
    const data = await this.mitraService.findAll(query);
    return { success: true, data };
  }

  @Get('nearby')
  async findNearby(@Query() query: MitraNearbyQueryDto) {
    const data = await this.mitraService.findNearby(query);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.mitraService.findOne(id);
    return { success: true, data };
  }
}

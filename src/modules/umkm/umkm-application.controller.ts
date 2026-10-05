import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { ApplyUmkmDto } from './dto/apply-umkm.dto';
import { UmkmService } from './umkm.service';

/** Pengajuan Mitra UMKM oleh pemilik usaha (akun Customer). */
@Controller('umkm-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UmkmApplicationController {
  constructor(private readonly umkm: UmkmService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  async apply(@Req() req: AuthenticatedRequest, @Body() dto: ApplyUmkmDto) {
    return { success: true, data: await this.umkm.apply(req.user.id, dto) };
  }

  /** Status pengajuan; null bila belum pernah mengajukan. */
  @Get('me')
  @Roles(Role.CUSTOMER, Role.UMKM)
  async mine(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.umkm.myApplication(req.user.id) };
  }
}

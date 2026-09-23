import {
  BadRequestException,
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
import { Role } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { MembershipService } from './membership.service';
import {
  ApplyMembershipDto,
  MembershipQueryDto,
  ReviewMembershipDto,
  UpdateKopdesProfileDto,
} from './dto/membership.dto';
import { KoperasiService } from './koperasi.service';

/**
 * Pendaftaran anggota dari sisi warga.
 *
 * Wajib login: keanggotaan melekat pada akun, dan tanpa itu tidak ada yang
 * bisa dihubungi maupun diverifikasi pengurus.
 */
@Controller('koperasi/:id/members')
@UseGuards(JwtAuthGuard)
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  /// Status keanggotaan pembuka halaman. `null` berarti belum pernah
  /// mendaftar — dibedakan dari ditolak, yang punya alasannya sendiri.
  @Get('me')
  async mine(@Param('id') kopdesId: string, @Req() req: AuthenticatedRequest) {
    const data = await this.membership.mine(req.user.id, kopdesId);
    return { success: true, data };
  }

  @Post()
  async apply(
    @Param('id') kopdesId: string,
    @Body() dto: ApplyMembershipDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.membership.apply(req.user.id, kopdesId, dto);
    return { success: true, data };
  }
}

/**
 * Verifikasi pendaftar oleh pengurus koperasi.
 *
 * `PEGAWAI_KOPDES` tidak ada di daftar: keanggotaan menentukan siapa yang
 * berhak atas layanan anggota, jadi keputusannya milik pemilik koperasi.
 * Lingkup desanya diambil dari token, bukan dari parameter — tanpa itu satu
 * Admin Kopdes bisa memverifikasi pendaftar desa lain.
 */
@Controller('admin/members')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
@RequirePermissions(Permission.MEMBER_MANAGE)
export class AdminMembershipController {
  constructor(private readonly membership: MembershipService) {}

  /**
   * Desa yang sedang dilihat.
   *
   * Admin Kopdes selalu memakai desanya sendiri, apa pun isi query —
   * menerima `kopdesId` dari klien di sini sama dengan membuka pendaftar
   * desa lain. Super Admin memang lintas desa, jadi ia yang memilih.
   */
  private scopeOf(req: AuthenticatedRequest, query: MembershipQueryDto) {
    const scope = req.user.kopdesId ?? query.kopdesId;
    if (!scope) {
      throw new BadRequestException(
        'Super Admin harus menyebut kopdesId yang ingin dibuka.',
      );
    }
    return scope;
  }

  @Get()
  async list(
    @Query() query: MembershipQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.membership.list(this.scopeOf(req, query), query);
    return { success: true, data };
  }

  @Get('counts')
  async counts(
    @Query() query: MembershipQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.membership.counts(this.scopeOf(req, query));
    return { success: true, data };
  }

  @Patch(':memberId')
  async review(
    @Param('memberId') memberId: string,
    @Body() dto: ReviewMembershipDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.membership.review(
      memberId,
      req.user.kopdesId,
      req.user.id,
      dto,
    );
    return { success: true, data };
  }
}


/**
 * Profil koperasi yang diurus pemiliknya sendiri.
 *
 * Terpisah dari `/koperasi/:id`, yang publik dan hanya membaca. Lingkup
 * desanya diambil dari token; `kopdesId` di body hanya berlaku untuk Super
 * Admin, yang memang lintas desa.
 */
@Controller('admin/kopdes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
@RequirePermissions(Permission.KOPDES_POLICY_MANAGE)
export class AdminKopdesProfileController {
  constructor(private readonly koperasi: KoperasiService) {}

  @Patch('profile')
  async update(
    @Body() dto: UpdateKopdesProfileDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const scope = req.user.kopdesId ?? dto.kopdesId;
    if (!scope) {
      throw new BadRequestException(
        'Super Admin harus menyebut kopdesId yang ingin diubah.',
      );
    }
    const data = await this.koperasi.updateProfile(scope, dto);
    return { success: true, data };
  }
}

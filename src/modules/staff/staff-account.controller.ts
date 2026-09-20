import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { StaffAccountService } from './staff-account.service';
import {
  CreatePegawaiDto,
  UpdatePegawaiDto,
} from './dto/manage-staff.dto';

/**
 * Pengelolaan akun pegawai oleh pemilik Kopdes.
 *
 * Terpisah dari `/super-admin/accounts`, yang berwenang lintas desa dan bisa
 * mengangkat Admin Kopdes. Di sini lingkupnya satu desa dan satu peran.
 *
 * `PEGAWAI_KOPDES` sengaja tidak ada di daftar `@Roles`: pegawai tidak
 * mengangkat pegawai. `SUPER_ADMIN` ikut supaya ia bisa menolong satu desa
 * tanpa berpindah panel.
 */
@Controller('admin/staff')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
@RequirePermissions(Permission.STAFF_MANAGE)
export class StaffAccountController {
  constructor(private readonly accounts: StaffAccountService) {}

  /** Daftar wewenang yang boleh diberikan, lengkap dengan labelnya. */
  @Get('permissions')
  catalog() {
    return { success: true, data: this.accounts.catalog() };
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.accounts.list(req.user) };
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePegawaiDto,
  ) {
    return {
      success: true,
      message: 'Akun pegawai dibuat',
      data: await this.accounts.create(req.user, dto),
    };
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePegawaiDto,
  ) {
    return {
      success: true,
      message: 'Akun pegawai diperbarui',
      data: await this.accounts.update(req.user, id, dto),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.accounts.remove(req.user, id);
    return { success: true, message: 'Akun pegawai dihapus' };
  }
}

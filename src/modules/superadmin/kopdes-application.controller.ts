import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { KopdesApplicationStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { KopdesApplicationService } from './kopdes-application.service';
import {
  ApproveKopdesApplicationDto,
  RejectKopdesApplicationDto,
  SubmitKopdesApplicationDto,
} from './dto/kopdes-application.dto';

/**
 * Formulir pengajuan — **tanpa autentikasi**.
 *
 * Koperasi yang belum bergabung tentu belum punya akun, jadi tidak ada token
 * yang bisa diminta di sini. Terpisah dari controller `super-admin` supaya
 * `@Roles(SUPER_ADMIN)` di sana tidak perlu dilubangi untuk satu endpoint.
 */
@Controller('kopdes-applications')
export class KopdesApplicationPublicController {
  constructor(private readonly service: KopdesApplicationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submit(@Body() dto: SubmitKopdesApplicationDto) {
    const data = await this.service.submit(dto);
    return {
      success: true,
      message:
        'Pengajuan diterima. Pengurus sistem akan meninjau dan menghubungi Anda.',
      data,
    };
  }
}

/** Peninjauan pengajuan dan pemantauan koperasi — Super Admin saja. */
@Controller('super-admin/applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class KopdesApplicationAdminController {
  constructor(private readonly service: KopdesApplicationService) {}

  @Get()
  async list(@Query('status') status?: KopdesApplicationStatus) {
    return { success: true, data: await this.service.list(status) };
  }

  @Get('counts')
  async counts() {
    return { success: true, data: await this.service.counts() };
  }

  @Patch(':id/approve')
  async approve(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ApproveKopdesApplicationDto,
  ) {
    const data = await this.service.approve(id, req.user.id, dto);
    return {
      success: true,
      message:
        'Koperasi dan akun Admin Kopdes dibuat. Salin kata sandi awal sekarang — ia tidak ditampilkan lagi.',
      data,
    };
  }

  @Patch(':id/reject')
  async reject(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RejectKopdesApplicationDto,
  ) {
    return {
      success: true,
      message: 'Pengajuan ditolak',
      data: await this.service.reject(id, req.user.id, dto),
    };
  }
}

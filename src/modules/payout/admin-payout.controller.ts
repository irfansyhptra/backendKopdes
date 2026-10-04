import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  ListPayoutsQueryDto,
  MarkPayoutPaidDto,
  RejectPayoutDto,
} from './dto/payout.dto';
import { PayoutService } from './payout.service';

/** Antrean pencairan mitra UMKM untuk pengurus Kopdes. */
@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.SUPER_ADMIN)
@RequirePermissions(Permission.PAYOUT_PROCESS)
export class AdminPayoutController {
  constructor(private readonly payouts: PayoutService) {}

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListPayoutsQueryDto,
  ) {
    return {
      success: true,
      data: await this.payouts.adminList(req.user, query),
    };
  }

  @Patch(':id/paid')
  async markPaid(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: MarkPayoutPaidDto,
  ) {
    return {
      success: true,
      data: await this.payouts.markPaid(req.user, id, dto.transferRef),
    };
  }

  @Patch(':id/reject')
  async reject(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RejectPayoutDto,
  ) {
    return {
      success: true,
      data: await this.payouts.reject(req.user, id, dto.reason),
    };
  }
}

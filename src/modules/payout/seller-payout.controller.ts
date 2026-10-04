import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  ListPayoutsQueryDto,
  RequestPayoutDto,
  UpsertBankAccountDto,
} from './dto/payout.dto';
import { PayoutService } from './payout.service';

@Controller('seller')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.UMKM)
export class SellerPayoutController {
  constructor(private readonly payouts: PayoutService) {}

  @Get('payouts/summary')
  async summary(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.payouts.summary(req.user.id) };
  }

  @Get('payouts')
  async history(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListPayoutsQueryDto,
  ) {
    return {
      success: true,
      data: await this.payouts.history(req.user.id, query),
    };
  }

  @Post('payouts')
  async request(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RequestPayoutDto,
  ) {
    return {
      success: true,
      message: 'Pencairan diajukan',
      data: await this.payouts.request(req.user.id, dto),
    };
  }

  @Get('bank-account')
  async bankAccount(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.payouts.bankAccount(req.user.id) };
  }

  @Put('bank-account')
  async upsertBankAccount(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpsertBankAccountDto,
  ) {
    return {
      success: true,
      data: await this.payouts.upsertBankAccount(req.user.id, dto),
    };
  }
}

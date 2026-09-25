import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role, TopUpStatus } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { MidtransService } from '../payment/midtrans.service';
import { chargePayloadFor } from '../payment/midtrans.types';
import { normalizeCharge } from '../payment/payment-status';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from './wallet.service';
import {
  AdjustWalletDto,
  CreateTopUpDto,
  WalletEntryQueryDto,
} from './dto/wallet.dto';

/**
 * Saldo warga: melihat, mengisi ulang, dan menelusuri mutasinya.
 *
 * Seluruhnya melekat pada akun yang sedang masuk — tidak ada satu pun endpoint
 * di sini yang menerima `userId` dari klien.
 */
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly wallet: WalletService,
    private readonly midtrans: MidtransService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async balance(@Req() req: AuthenticatedRequest) {
    const data = await this.wallet.getBalance(req.user.id);
    return { success: true, data };
  }

  @Get('entries')
  async entries(
    @Query() query: WalletEntryQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.wallet.getEntries(
      req.user.id,
      query.page,
      query.limit,
    );
    return { success: true, data };
  }

  /**
   * Membuat tagihan isi ulang di Midtrans.
   *
   * Saldo TIDAK bertambah di sini. Penambahannya hanya terjadi saat webhook
   * Midtrans memastikan pembayarannya lunas — kalau tidak, siapa pun bisa
   * mencetak saldo dengan memanggil endpoint ini berulang kali.
   */
  @Post('topup')
  async topUp(@Body() dto: CreateTopUpDto, @Req() req: AuthenticatedRequest) {
    const topUp = await this.wallet.createTopUp(
      req.user.id,
      dto.amount,
      dto.paymentMethod,
    );

    const customer = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, email: true, phone: true },
    });

    const res = await this.midtrans.charge({
      ...chargePayloadFor(dto.paymentMethod),
      transaction_details: {
        order_id: topUp.midtransOrderId,
        gross_amount: dto.amount,
      },
      customer_details: {
        first_name: customer?.name ?? 'Warga',
        email: customer?.email,
        ...(customer?.phone ? { phone: customer.phone } : {}),
      },
      item_details: [
        {
          id: 'TOPUP',
          price: dto.amount,
          quantity: 1,
          name: 'Isi ulang saldo KMP Mitra',
        },
      ],
    });

    // 201 dan 200 sama-sama berhasil di Midtrans; selain itu tagihannya tidak
    // pernah ada, jadi isi ulangnya ditutup daripada menggantung PENDING.
    if (res.status_code !== '201' && res.status_code !== '200') {
      await this.wallet.closeTopUp(topUp.id, TopUpStatus.FAILED);
      this.logger.warn(
        `Charge isi ulang ditolak (${res.status_code}) untuk ${topUp.midtransOrderId}`,
      );
      throw new BadRequestException(
        res.status_message ?? 'Tagihan isi ulang gagal dibuat.',
      );
    }

    const normalized = normalizeCharge(res, dto.paymentMethod);
    const saved = await this.wallet.saveTopUpCharge(topUp.id, {
      // `normalizeCharge` memakai null untuk "tidak ada"; DTO service memakai
      // undefined. Disamakan di sini, bukan dengan melonggarkan tipenya.
      transactionId: normalized.transactionId ?? undefined,
      transactionStatus: normalized.transactionStatus ?? undefined,
      fraudStatus: normalized.fraudStatus ?? undefined,
      actions: {
        qrCodeUrl: normalized.qrCodeUrl,
        deeplinkUrl: normalized.deeplinkUrl,
        vaNumber: normalized.vaNumber,
        bank: normalized.bank,
        billKey: normalized.billKey,
        billerCode: normalized.billerCode,
      },
      expiresAt: normalized.expiryTime ? new Date(normalized.expiryTime) : null,
    });

    return {
      success: true,
      data: { ...saved, amount: Number(saved.amount) },
    };
  }

  @Get('topup/:id')
  async topUpStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const data = await this.wallet.getTopUp(req.user.id, id);
    return { success: true, data };
  }
}

/**
 * Koreksi saldo oleh Super Admin.
 *
 * Satu-satunya jalur yang menambah saldo tanpa uang masuk lewat Midtrans,
 * jadi ia terkunci pada satu peran, menuntut alasan, dan tetap melewati buku
 * besar yang sama — tidak ada penulisan langsung ke kolom saldo.
 */
@Controller('super-admin/wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AdminWalletController {
  constructor(private readonly wallet: WalletService) {}

  @Post('adjust')
  async adjust(@Body() dto: AdjustWalletDto) {
    if (dto.amount === 0) {
      throw new BadRequestException('Koreksi bernilai nol tidak dicatat.');
    }
    const data = await this.wallet.adjust(dto.userId, dto.amount, dto.reason);
    return {
      success: true,
      data: {
        ...data,
        amount: Number(data.amount),
        balanceAfter: Number(data.balanceAfter),
      },
    };
  }

  /// Pemeriksaan pembukuan: saldo tercatat vs jumlah seluruh entri.
  @Get(':userId/integrity')
  async integrity(@Param('userId') userId: string) {
    const data = await this.wallet.verifyIntegrity(userId);
    return { success: true, data };
  }
}

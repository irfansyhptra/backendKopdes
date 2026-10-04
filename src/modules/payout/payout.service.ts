import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayoutStatus, Prisma, UMKMStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/authenticated-request';
import {
  ListPayoutsQueryDto,
  RequestPayoutDto,
  UpsertBankAccountDto,
} from './dto/payout.dto';
import { PAYOUT_RULES, splitFee } from './payout.rules';

type Db = Prisma.TransactionClient | PrismaService;

export type PayoutBlocker =
  | 'NOT_VERIFIED'
  | 'NO_BANK_ACCOUNT'
  | 'PENDING_REQUEST'
  | 'BELOW_MINIMUM';

const formatRupiah = (n: number) =>
  `Rp${Math.round(n).toLocaleString('id-ID')}`;

/** "1234567890" → "•••• 7890". Nomor lengkap hanya di halaman rekening. */
const mask = (n: string) => `•••• ${n.slice(-4)}`;

@Injectable()
export class PayoutService {
  constructor(private readonly prisma: PrismaService) {}

  private async umkmOf(userId: string, db: Db = this.prisma) {
    const umkm = await db.uMKM.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });
    if (!umkm) {
      throw new NotFoundException('Profil UMKM tidak ditemukan untuk akun ini');
    }
    return umkm;
  }

  /**
   * Saldo toko, dihitung dari sumbernya setiap kali — tidak ada kolom
   * "saldo" yang bisa melenceng dari pesanan.
   *
   * - tersedia  = barang dari pesanan SELESAI − fee − pencairan diajukan/dibayar
   * - tertahan  = barang dari pesanan yang SUDAH DIBAYAR tetapi belum selesai
   * - belum selesai = pesanan yang masih berjalan dan belum dibayar (mis. COD)
   */
  private async balances(umkmId: string, db: Db = this.prisma) {
    const [orders] = await db.$queryRaw<
      {
        completed_gross: Prisma.Decimal;
        held_gross: Prisma.Decimal;
        unpaid_gross: Prisma.Decimal;
        open_orders: bigint;
      }[]
    >`
      SELECT
        COALESCE(SUM(oi."price" * oi."quantity") FILTER (
          WHERE o."status" = 'COMPLETED' AND o."paymentStatus" <> 'REFUNDED'
        ), 0) AS completed_gross,
        COALESCE(SUM(oi."price" * oi."quantity") FILTER (
          WHERE o."status" NOT IN ('COMPLETED', 'CANCELLED')
            AND o."paymentStatus" = 'PAID'
        ), 0) AS held_gross,
        COALESCE(SUM(oi."price" * oi."quantity") FILTER (
          WHERE o."status" NOT IN ('COMPLETED', 'CANCELLED')
            AND o."paymentStatus" <> 'PAID'
        ), 0) AS unpaid_gross,
        COUNT(DISTINCT o."id") FILTER (
          WHERE o."status" NOT IN ('COMPLETED', 'CANCELLED')
        ) AS open_orders
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      JOIN "UMKMProduct" p ON p."id" = oi."umkmProductId"
      WHERE p."umkmId" = ${umkmId}
    `;

    const payouts = await db.uMKMPayout.groupBy({
      by: ['status'],
      where: { umkmId, status: { in: ['REQUESTED', 'PAID'] } },
      _sum: { amount: true },
    });
    const sumOf = (s: PayoutStatus) =>
      Number(payouts.find((p) => p.status === s)?._sum.amount ?? 0);

    const completed = splitFee(Number(orders?.completed_gross ?? 0));
    const held = splitFee(Number(orders?.held_gross ?? 0)).net;
    const unpaid = splitFee(Number(orders?.unpaid_gross ?? 0)).net;
    const requested = sumOf('REQUESTED');
    const paid = sumOf('PAID');

    return {
      completedGross: completed.net + completed.fee,
      completedFee: completed.fee,
      completedNet: completed.net,
      // Tidak pernah negatif di layar: pesanan selesai yang kemudian
      // di-refund bisa membuat hitungannya minus, dan "−Rp5.000 tersedia"
      // tidak berarti apa-apa bagi penjual.
      available: Math.max(0, completed.net - requested - paid),
      held,
      pendingPayout: requested,
      paidOut: paid,
      openOrders: {
        count: Number(orders?.open_orders ?? 0),
        amount: held + unpaid,
      },
    };
  }

  private blockers(
    status: UMKMStatus,
    hasAccount: boolean,
    balances: { available: number; pendingPayout: number },
  ) {
    const out: { code: PayoutBlocker; message: string }[] = [];
    if (status !== UMKMStatus.ACTIVE) {
      out.push({
        code: 'NOT_VERIFIED',
        message: 'Toko belum terverifikasi Admin Kopdes.',
      });
    }
    if (!hasAccount) {
      out.push({
        code: 'NO_BANK_ACCOUNT',
        message: 'Isi rekening pencairan lebih dulu.',
      });
    }
    if (balances.pendingPayout > 0) {
      out.push({
        code: 'PENDING_REQUEST',
        message: `Pencairan ${formatRupiah(balances.pendingPayout)} masih diproses pengurus Kopdes.`,
      });
    }
    if (balances.available < PAYOUT_RULES.minWithdrawal) {
      out.push({
        code: 'BELOW_MINIMUM',
        message: `Saldo tersedia minimal ${formatRupiah(PAYOUT_RULES.minWithdrawal)} untuk ditarik.`,
      });
    }
    return out;
  }

  async summary(userId: string) {
    const umkm = await this.umkmOf(userId);
    const [balances, account] = await Promise.all([
      this.balances(umkm.id),
      this.prisma.uMKMBankAccount.findUnique({ where: { umkmId: umkm.id } }),
    ]);
    const blockers = this.blockers(umkm.status, !!account, balances);

    return {
      ...balances,
      feePercent: PAYOUT_RULES.feePercent,
      minWithdrawal: PAYOUT_RULES.minWithdrawal,
      bankAccount: account
        ? {
            bankName: account.bankName,
            accountNumberMasked: mask(account.accountNumber),
            accountHolder: account.accountHolder,
          }
        : null,
      canWithdraw: blockers.length === 0,
      blockers,
    };
  }

  async history(userId: string, query: ListPayoutsQueryDto) {
    const umkm = await this.umkmOf(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UMKMPayoutWhereInput = {
      umkmId: umkm.id,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.uMKMPayout.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.uMKMPayout.count({ where }),
    ]);
    return {
      payouts: rows.map((r) => ({
        ...r,
        amount: Number(r.amount),
        accountNumber: mask(r.accountNumber),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Mengajukan pencairan.
   *
   * Baris UMKM dikunci (`FOR UPDATE`) selama saldo dihitung ulang dan
   * permintaan ditulis: dua ketukan "Tarik" yang tiba bersamaan — dari dua
   * ponsel, atau dari jaringan yang mengulang — tidak boleh sama-sama lolos
   * memeriksa saldo yang sama lalu menarik dua kali.
   */
  async request(userId: string, dto: RequestPayoutDto) {
    return this.prisma.$transaction(async (tx) => {
      const umkm = await this.umkmOf(userId, tx);
      await tx.$queryRaw`SELECT "id" FROM "UMKM" WHERE "id" = ${umkm.id} FOR UPDATE`;

      const [balances, account] = await Promise.all([
        this.balances(umkm.id, tx),
        tx.uMKMBankAccount.findUnique({ where: { umkmId: umkm.id } }),
      ]);
      const blockers = this.blockers(umkm.status, !!account, balances);
      if (blockers.length > 0) {
        throw new BadRequestException(blockers[0].message);
      }
      if (dto.amount < PAYOUT_RULES.minWithdrawal) {
        throw new BadRequestException(
          `Minimal penarikan ${formatRupiah(PAYOUT_RULES.minWithdrawal)}.`,
        );
      }
      if (dto.amount > balances.available) {
        throw new BadRequestException(
          `Saldo tersedia hanya ${formatRupiah(balances.available)}.`,
        );
      }

      const payout = await tx.uMKMPayout.create({
        data: {
          umkmId: umkm.id,
          amount: dto.amount,
          bankName: account!.bankName,
          accountNumber: account!.accountNumber,
          accountHolder: account!.accountHolder,
        },
      });
      return {
        ...payout,
        amount: Number(payout.amount),
        accountNumber: mask(payout.accountNumber),
      };
    });
  }

  async bankAccount(userId: string) {
    const umkm = await this.umkmOf(userId);
    return this.prisma.uMKMBankAccount.findUnique({
      where: { umkmId: umkm.id },
      select: {
        bankName: true,
        accountNumber: true,
        accountHolder: true,
        updatedAt: true,
      },
    });
  }

  async upsertBankAccount(userId: string, dto: UpsertBankAccountDto) {
    const umkm = await this.umkmOf(userId);
    return this.prisma.uMKMBankAccount.upsert({
      where: { umkmId: umkm.id },
      create: { umkmId: umkm.id, ...dto },
      update: dto,
      select: {
        bankName: true,
        accountNumber: true,
        accountHolder: true,
        updatedAt: true,
      },
    });
  }

  // ── Admin Kopdes ─────────────────────────────────────────────

  /** Super Admin melihat semua desa; pengurus hanya mitra desanya. */
  private scope(user: AuthenticatedUser): Prisma.UMKMPayoutWhereInput {
    return user.kopdesId ? { umkm: { kopdesId: user.kopdesId } } : {};
  }

  async adminList(user: AuthenticatedUser, query: ListPayoutsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UMKMPayoutWhereInput = {
      ...this.scope(user),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.uMKMPayout.findMany({
        where,
        // Yang paling lama menunggu di atas.
        orderBy: { requestedAt: query.status === 'REQUESTED' ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          umkm: { select: { id: true, businessName: true, phone: true } },
        },
      }),
      this.prisma.uMKMPayout.count({ where }),
    ]);
    return {
      // Nomor rekening lengkap: pengurus yang mentransfer membutuhkannya.
      payouts: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Menutup permintaan yang masih REQUESTED. Ditulis bersyarat status, jadi
   * dua pengurus yang menekan tombol bersamaan tidak sama-sama "berhasil".
   */
  private async close(
    user: AuthenticatedUser,
    id: string,
    data: Prisma.UMKMPayoutUpdateManyMutationInput,
  ) {
    const exists = await this.prisma.uMKMPayout.findFirst({
      where: { id, ...this.scope(user) },
      select: { id: true },
    });
    if (!exists)
      throw new NotFoundException('Permintaan pencairan tidak ditemukan');

    const { count } = await this.prisma.uMKMPayout.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { ...data, processedAt: new Date(), processedById: user.id },
    });
    if (count === 0) {
      throw new ConflictException('Permintaan ini sudah diproses sebelumnya.');
    }
    const row = await this.prisma.uMKMPayout.findUniqueOrThrow({
      where: { id },
    });
    return { ...row, amount: Number(row.amount) };
  }

  markPaid(user: AuthenticatedUser, id: string, transferRef: string) {
    return this.close(user, id, { status: 'PAID', transferRef });
  }

  reject(user: AuthenticatedUser, id: string, reason: string) {
    return this.close(user, id, {
      status: 'REJECTED',
      rejectionReason: reason,
    });
  }
}

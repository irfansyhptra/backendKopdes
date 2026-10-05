import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TopUpStatus,
  WalletEntryType,
  type PaymentMethod,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { MidtransService } from '../payment/midtrans.service';
import type { MidtransNotification } from '../payment/midtrans.types';

/**
 * Buku besar saldo warga.
 *
 * Aturan yang dipegang seluruh berkas ini:
 *
 * 1. **Saldo tidak pernah ditulis sendirian.** Setiap perubahan saldo terjadi
 *    di dalam satu transaksi bersama baris `WalletEntry` yang menjelaskannya.
 *    Tanpa itu, kegagalan di tengah menyisakan angka tanpa sebab.
 * 2. **Entri tidak pernah diubah.** Koreksi ditulis sebagai entri lawan.
 * 3. **Nominal tidak pernah dipercaya dari klien.** Yang dikirim klien hanya
 *    niat (isi ulang berapa, bayar pesanan mana); nilainya dihitung server.
 * 4. **Rupiah selalu Decimal.** Tidak ada `number` di jalur uang.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  /// Batas isi ulang. Bawah: di bawah ini biayanya lebih besar daripada
  /// isinya. Atas: penjaga salah ketik — Rp10 juta sekali isi sudah jauh di
  /// atas kebutuhan belanja harian warga desa.
  static readonly MIN_TOPUP = 10_000;
  static readonly MAX_TOPUP = 10_000_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly midtrans: MidtransService,
  ) {}

  /** Dompet pengguna, dibuat saat pertama kali dibutuhkan. */
  async ensureWallet(userId: string) {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true, balance: true, userId: true },
    });
  }

  async getBalance(userId: string) {
    const wallet = await this.ensureWallet(userId);
    return {
      walletId: wallet.id,
      balance: Number(wallet.balance),
    };
  }

  /** Mutasi terbaru, terbaru dulu. */
  async getEntries(userId: string, page = 1, limit = 20) {
    const wallet = await this.ensureWallet(userId);
    const where = { walletId: wallet.id };

    const [rows, total] = await Promise.all([
      this.prisma.walletEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          balanceAfter: true,
          type: true,
          description: true,
          referenceType: true,
          referenceId: true,
          createdAt: true,
        },
      }),
      this.prisma.walletEntry.count({ where }),
    ]);

    return {
      entries: rows.map((e) => ({
        ...e,
        amount: Number(e.amount),
        balanceAfter: Number(e.balanceAfter),
      })),
      balance: Number(wallet.balance),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Menulis satu mutasi beserta saldo barunya, dalam satu transaksi.
   *
   * `tx` wajib: pemanggilnya yang menentukan batas transaksi, karena
   * pembayaran pesanan harus memotong saldo dan mengubah pesanan sebagai satu
   * kesatuan — bukan dua langkah yang bisa putus di tengah.
   *
   * `idempotencyKey` membuat pengulangan aman: entri kedua dengan kunci sama
   * ditolak unique index, dan pemanggilnya memperlakukan itu sebagai "sudah
   * pernah dikerjakan", bukan sebagai kegagalan.
   */
  private async post(
    tx: Prisma.TransactionClient,
    params: {
      walletId: string;
      amount: Prisma.Decimal | number;
      type: WalletEntryType;
      description?: string;
      referenceType?: string;
      referenceId?: string;
      idempotencyKey?: string;
    },
  ) {
    const amount = new Prisma.Decimal(params.amount);
    if (amount.isZero()) {
      throw new BadRequestException('Mutasi bernilai nol tidak dicatat.');
    }

    // Kunci barisnya lebih dulu: dua permintaan yang berjalan bersamaan tidak
    // boleh membaca saldo yang sama lalu menuliskan hasil yang berbeda.
    const [wallet] = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
      SELECT "balance" FROM "Wallet" WHERE "id" = ${params.walletId} FOR UPDATE
    `;
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan.');

    const balanceAfter = new Prisma.Decimal(wallet.balance).plus(amount);
    if (balanceAfter.isNegative()) {
      throw new BadRequestException('Saldo tidak mencukupi.');
    }

    const entry = await tx.walletEntry.create({
      data: {
        walletId: params.walletId,
        amount,
        balanceAfter,
        type: params.type,
        description: params.description ?? null,
        referenceType: params.referenceType ?? null,
        referenceId: params.referenceId ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
      },
      select: { id: true, amount: true, balanceAfter: true, createdAt: true },
    });

    await tx.wallet.update({
      where: { id: params.walletId },
      data: { balance: balanceAfter },
    });

    return entry;
  }

  /**
   * Mencatat isi ulang yang sudah lunas.
   *
   * Dipanggil dari webhook Midtrans, yang bisa datang lebih dari sekali untuk
   * transaksi yang sama. Kunci idempotennya adalah `midtransOrderId`, jadi
   * pengulangan tidak menambah saldo dua kali — ia hanya mengembalikan status
   * yang sudah ada.
   */
  async creditTopUp(topUpId: string) {
    return this.prisma.$transaction(async (tx) => {
      const topUp = await tx.walletTopUp.findUnique({
        where: { id: topUpId },
        select: {
          id: true,
          walletId: true,
          amount: true,
          status: true,
          midtransOrderId: true,
        },
      });
      if (!topUp) throw new NotFoundException('Isi ulang tidak ditemukan.');

      if (topUp.status === TopUpStatus.PAID) {
        // Sudah pernah dikreditkan. Bukan galat: webhook memang bisa berulang.
        return { alreadyCredited: true, topUpId: topUp.id };
      }

      await this.post(tx, {
        walletId: topUp.walletId,
        amount: topUp.amount,
        type: WalletEntryType.TOPUP,
        description: 'Isi ulang saldo',
        referenceType: 'topup',
        referenceId: topUp.id,
        idempotencyKey: `topup:${topUp.midtransOrderId}`,
      });

      await tx.walletTopUp.update({
        where: { id: topUp.id },
        data: { status: TopUpStatus.PAID, paidAt: new Date() },
      });

      return { alreadyCredited: false, topUpId: topUp.id };
    });
  }

  /** Menandai isi ulang yang kedaluwarsa atau gagal. Saldo tidak disentuh. */
  async closeTopUp(topUpId: string, status: TopUpStatus) {
    await this.prisma.walletTopUp.updateMany({
      // Hanya yang masih menunggu: yang sudah lunas tidak boleh dibatalkan
      // oleh notifikasi yang datang terlambat dan tidak berurutan.
      where: { id: topUpId, status: TopUpStatus.PENDING },
      data: { status },
    });
  }

  /**
   * Memotong saldo untuk membayar pesanan.
   *
   * Nominalnya dari database, bukan dari klien. Dipanggil di dalam transaksi
   * milik pemesanan supaya potongan saldo dan perubahan pesanan jadi satu.
   */
  async debitForOrder(
    tx: Prisma.TransactionClient,
    userId: string,
    orderId: string,
    amount: Prisma.Decimal | number,
  ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) throw new BadRequestException('Saldo tidak mencukupi.');

    return this.post(tx, {
      walletId: wallet.id,
      amount: new Prisma.Decimal(amount).negated(),
      type: WalletEntryType.PAYMENT,
      description: 'Pembayaran pesanan',
      referenceType: 'order',
      referenceId: orderId,
      idempotencyKey: `order:${orderId}`,
    });
  }

  /** Mengembalikan dana pesanan yang batal. */
  async refundOrder(
    tx: Prisma.TransactionClient,
    userId: string,
    orderId: string,
    amount: Prisma.Decimal | number,
    reason: string,
  ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan.');

    return this.post(tx, {
      walletId: wallet.id,
      amount: new Prisma.Decimal(amount),
      type: WalletEntryType.REFUND,
      description: reason,
      referenceType: 'order',
      referenceId: orderId,
      idempotencyKey: `refund:${orderId}`,
    });
  }

  /**
   * Koreksi manual oleh Super Admin.
   *
   * Selalu meninggalkan alasan, dan tetap lewat jalur yang sama — tidak ada
   * pintu belakang yang menulis `balance` langsung.
   */
  async adjust(userId: string, amount: number, reason: string) {
    const wallet = await this.ensureWallet(userId);
    return this.prisma.$transaction((tx) =>
      this.post(tx, {
        walletId: wallet.id,
        amount,
        type: WalletEntryType.ADJUSTMENT,
        description: reason,
        referenceType: 'manual',
      }),
    );
  }

  /**
   * Memeriksa bahwa saldo tercatat memang sama dengan jumlah seluruh entri.
   *
   * Dipakai saat rekonsiliasi. Selisih berarti ada jalur yang menulis saldo
   * di luar `post()` — dan itu harus ketahuan, bukan dibiarkan.
   */
  async verifyIntegrity(userId: string) {
    const wallet = await this.ensureWallet(userId);
    const sum = await this.prisma.walletEntry.aggregate({
      where: { walletId: wallet.id },
      _sum: { amount: true },
    });
    const ledger = new Prisma.Decimal(sum._sum.amount ?? 0);
    const recorded = new Prisma.Decimal(wallet.balance);
    const matches = ledger.equals(recorded);

    if (!matches) {
      this.logger.error(
        `Saldo dompet ${wallet.id} tidak cocok: tercatat ${recorded.toString()}, buku besar ${ledger.toString()}`,
      );
    }

    return {
      walletId: wallet.id,
      recorded: Number(recorded),
      ledger: Number(ledger),
      matches,
    };
  }

  // ── Isi ulang ──

  /** `TOPUP-{id}-{unix}` — unik, mudah ditelusuri balik, di bawah 50 karakter. */
  static buildMidtransOrderId(topUpId: string, now = Date.now()): string {
    const short = topUpId.replace(/-/g, '').slice(0, 20);
    return `TOPUP-${short}-${Math.floor(now / 1000)}`;
  }

  /** Mengenali `order_id` milik isi ulang, bukan milik pesanan. */
  static isTopUpOrderId(midtransOrderId: string): boolean {
    return midtransOrderId.startsWith('TOPUP-');
  }

  async createTopUp(
    userId: string,
    amount: number,
    method: PaymentMethod,
  ): Promise<{ id: string; walletId: string; midtransOrderId: string }> {
    if (!Number.isInteger(amount)) {
      throw new BadRequestException('Nominal isi ulang harus bilangan bulat.');
    }
    if (amount < WalletService.MIN_TOPUP) {
      throw new BadRequestException(
        `Isi ulang minimal Rp${WalletService.MIN_TOPUP.toLocaleString('id-ID')}.`,
      );
    }
    if (amount > WalletService.MAX_TOPUP) {
      throw new BadRequestException(
        `Isi ulang maksimal Rp${WalletService.MAX_TOPUP.toLocaleString('id-ID')} sekali transaksi.`,
      );
    }

    const wallet = await this.ensureWallet(userId);
    const topUp = await this.prisma.walletTopUp.create({
      data: {
        walletId: wallet.id,
        amount,
        paymentMethod: method,
        // Diisi setelah id-nya ada; sementara pakai nilai unik agar kolomnya
        // tidak pernah kosong.
        midtransOrderId: `PENDING-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      select: { id: true, walletId: true },
    });

    const midtransOrderId = WalletService.buildMidtransOrderId(topUp.id);
    await this.prisma.walletTopUp.update({
      where: { id: topUp.id },
      data: { midtransOrderId },
    });

    return { ...topUp, midtransOrderId };
  }

  async saveTopUpCharge(
    topUpId: string,
    data: {
      transactionId?: string;
      transactionStatus?: string;
      fraudStatus?: string;
      snapToken?: string;
      snapRedirectUrl?: string;
      actions?: unknown;
      expiresAt?: Date | null;
    },
  ) {
    return this.prisma.walletTopUp.update({
      where: { id: topUpId },
      data: {
        transactionId: data.transactionId ?? null,
        transactionStatus: data.transactionStatus ?? null,
        fraudStatus: data.fraudStatus ?? null,
        snapToken: data.snapToken ?? null,
        snapRedirectUrl: data.snapRedirectUrl ?? null,
        actions: (data.actions ?? null) as Prisma.InputJsonValue,
        expiresAt: data.expiresAt ?? null,
      },
      select: {
        id: true,
        amount: true,
        status: true,
        paymentMethod: true,
        midtransOrderId: true,
        snapToken: true,
        snapRedirectUrl: true,
        actions: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async findTopUpByMidtransOrderId(midtransOrderId: string) {
    return this.prisma.walletTopUp.findUnique({
      where: { midtransOrderId },
      select: { id: true, walletId: true, amount: true, status: true },
    });
  }

  async getTopUp(userId: string, topUpId: string) {
    const wallet = await this.ensureWallet(userId);
    const topUp = await this.prisma.walletTopUp.findFirst({
      // Lewat walletId, bukan hanya id: isi ulang orang lain bukan urusannya.
      where: { id: topUpId, walletId: wallet.id },
      select: {
        id: true,
        amount: true,
        status: true,
        paymentMethod: true,
        snapToken: true,
        snapRedirectUrl: true,
        actions: true,
        expiresAt: true,
        paidAt: true,
        createdAt: true,
      },
    });
    if (!topUp) throw new NotFoundException('Isi ulang tidak ditemukan.');
    return { ...topUp, amount: Number(topUp.amount) };
  }

  /**
   * Menangani notifikasi Midtrans untuk isi ulang.
   *
   * Dipanggil controller webhook setelah ia mengenali `order_id` berawalan
   * `TOPUP-`. Urutan pemeriksaannya sama ketatnya dengan jalur pembayaran
   * pesanan: tanda tangan dulu, lalu keberadaan transaksinya, lalu
   * nominalnya. Notifikasi sah untuk transaksi lain tidak boleh melunasi
   * isi ulang ini.
   *
   * Selalu mengembalikan hasil, tidak pernah melempar: Midtrans mengirim
   * ulang apa pun yang tidak dijawab 200, dan notifikasi yang salah tanda
   * tangannya tidak akan menjadi benar pada percobaan kedua.
   */
  async handleTopUpNotification(
    notification: MidtransNotification,
  ): Promise<{ applied: boolean; reason?: string }> {
    if (!this.midtrans.verifySignature(notification)) {
      this.logger.warn(
        `Webhook isi ulang ditolak: tanda tangan tidak sah (${notification.order_id})`,
      );
      return { applied: false, reason: 'signature tidak sah' };
    }

    const topUp = await this.findTopUpByMidtransOrderId(notification.order_id);
    if (!topUp) {
      return { applied: false, reason: 'transaksi tidak dikenal' };
    }

    const expected = Math.round(Number(topUp.amount));
    const got = Math.round(Number(notification.gross_amount));
    if (expected !== got) {
      this.logger.warn(
        `Webhook isi ulang ditolak: nominal ${got} tidak cocok ${expected} (${notification.order_id})`,
      );
      return { applied: false, reason: 'nominal tidak cocok' };
    }

    const status = notification.transaction_status;
    const fraud = notification.fraud_status;

    // `capture` hanya lunas bila fraud-nya accept; `challenge` menunggu
    // peninjauan manual dan belum boleh menambah saldo.
    const paid =
      status === 'settlement' || (status === 'capture' && fraud === 'accept');

    if (paid) {
      const result = await this.creditTopUp(topUp.id);
      return {
        applied: !result.alreadyCredited,
        ...(result.alreadyCredited ? { reason: 'sudah pernah diproses' } : {}),
      };
    }

    if (status === 'expire') {
      await this.closeTopUp(topUp.id, TopUpStatus.EXPIRED);
      return { applied: true };
    }

    if (status === 'cancel' || status === 'deny' || status === 'failure') {
      await this.closeTopUp(topUp.id, TopUpStatus.FAILED);
      return { applied: true };
    }

    // `pending` dan `authorize`: belum ada yang berubah pada saldo.
    return { applied: false, reason: `status ${status} belum final` };
  }
}

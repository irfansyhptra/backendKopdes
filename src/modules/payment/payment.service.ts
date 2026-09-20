import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { MidtransService } from './midtrans.service';
import {
  chargePayloadFor,
  type MidtransChargeResponse,
  type MidtransMethod,
  type MidtransNotification,
} from './midtrans.types';
import {
  isFinal,
  normalizeCharge,
  orderStatusFor,
  paymentStatusFrom,
  shouldApply,
  viewFromMidtrans,
  type NormalizedCharge,
  type PaymentView,
} from './payment-status';

export interface PaymentSnapshot extends NormalizedCharge {
  /** Id pesanan di database kita, bukan `order_id` Midtrans. */
  orderId: string;
  method: string;
  status: PaymentView;
  paidAt: string | null;
}

/**
 * Pembayaran pesanan lewat Midtrans Core API.
 *
 * Tiga aturan yang dijaga di sini, bukan di klien:
 *
 *  1. **Nominal dihitung ulang dari database.** Apa pun yang dikirim klien
 *     tidak pernah sampai ke Midtrans.
 *  2. **Hanya pemilik pesanan yang boleh membayarnya.**
 *  3. **Hanya webhook yang sah boleh menandai lunas.** Klien yang kembali
 *     dari aplikasi e-wallet tidak membuktikan apa pun.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly midtrans: MidtransService,
    private readonly cache: CacheService,
  ) {}

  /** `KOMIT-{orderId}-{timestamp}` — unik dan mudah ditelusuri balik. */
  static buildMidtransOrderId(orderId: string, now = Date.now()): string {
    // Midtrans membatasi order_id 50 karakter; uuid penuh (36) + prefiks +
    // timestamp melewatinya, jadi id pesanan dipotong pada segmen pertamanya.
    const short = orderId.replace(/-/g, '').slice(0, 12);
    return `KOMIT-${short}-${Math.floor(now / 1000)}`;
  }

  private async ownedOrderOrThrow(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan.');
    // Pesanan orang lain dijawab "tidak ditemukan": membedakannya dari
    // "terlarang" memberi tahu penebak bahwa id-nya benar.
    if (order.customerId !== userId) {
      throw new NotFoundException('Pesanan tidak ditemukan.');
    }
    return order;
  }

  private snapshot(
    payment: {
      orderId: string;
      method: string;
      status: PaymentStatus;
      amount: Prisma.Decimal;
      midtransOrderId: string | null;
      transactionId: string | null;
      midtransPaymentType: string | null;
      transactionStatus: string | null;
      fraudStatus: string | null;
      expiryTime: Date | null;
      vaNumber: string | null;
      bank: string | null;
      qrCodeUrl: string | null;
      deeplinkUrl: string | null;
      paidAt: Date | null;
    },
  ): PaymentSnapshot {
    return {
      orderId: payment.orderId,
      method: payment.method,
      status: viewFromMidtrans(payment.transactionStatus, payment.fraudStatus),
      midtransOrderId: payment.midtransOrderId,
      transactionId: payment.transactionId,
      paymentType: payment.midtransPaymentType,
      transactionStatus: payment.transactionStatus,
      fraudStatus: payment.fraudStatus,
      grossAmount: Math.round(Number(payment.amount)),
      expiryTime: payment.expiryTime?.toISOString() ?? null,
      vaNumber: payment.vaNumber,
      bank: payment.bank,
      billKey: null,
      billerCode: null,
      qrCodeUrl: payment.qrCodeUrl,
      deeplinkUrl: payment.deeplinkUrl,
      actions: [],
      paidAt: payment.paidAt?.toISOString() ?? null,
    };
  }

  // ── Membuat transaksi ───────────────────────────────────────────────────

  async create(
    userId: string,
    orderId: string,
    method: MidtransMethod,
  ): Promise<PaymentSnapshot> {
    const order = await this.ownedOrderOrThrow(orderId, userId);
    const payment = order.payment;

    if (!payment) {
      throw new BadRequestException(
        'Pesanan ini belum punya tagihan. Buat pesanan ulang.',
      );
    }

    if (payment.status === PaymentStatus.PAID) {
      throw new BadRequestException('Pesanan ini sudah dibayar.');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Pesanan ini sudah dibatalkan.');
    }

    /**
     * Idempotensi.
     *
     * Transaksi yang masih hidup dipakai ulang alih-alih membuat yang baru:
     * tombol "Bayar Sekarang" yang ditekan dua kali tidak boleh menghasilkan
     * dua tagihan, dan Midtrans menolak order_id yang sama dipakai lagi.
     */
    const reusable =
      payment.midtransOrderId &&
      payment.method === method &&
      payment.status === PaymentStatus.PENDING &&
      !this.expired(payment.expiryTime);

    if (reusable) {
      return this.snapshot(payment);
    }

    // Nominal dari database, bukan dari klien.
    const grossAmount = Math.round(Number(payment.amount));
    if (grossAmount <= 0) {
      throw new BadRequestException('Nilai tagihan tidak sah.');
    }

    const midtransOrderId = PaymentService.buildMidtransOrderId(orderId);

    const customer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    const res = await this.midtrans.charge({
      ...chargePayloadFor(method),
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: customer?.name ?? 'Pelanggan',
        email: customer?.email,
        ...(customer?.phone ? { phone: customer.phone } : {}),
      },
    });

    // Midtrans memakai `status_code` 2xx untuk berhasil; selain itu transaksi
    // tidak terbentuk dan tidak ada yang layak disimpan.
    if (!res.status_code?.startsWith('2')) {
      this.logger.warn(
        `Charge ditolak Midtrans (${res.status_code}) untuk ${midtransOrderId}`,
      );
      throw new BadRequestException(
        res.status_message ?? 'Transaksi pembayaran gagal dibuat.',
      );
    }

    const normalized = normalizeCharge(res, method);
    const view = viewFromMidtrans(
      normalized.transactionStatus,
      normalized.fraudStatus,
    );

    const saved = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        method,
        status: paymentStatusFrom(view),
        midtransOrderId,
        transactionId: normalized.transactionId,
        midtransPaymentType: normalized.paymentType,
        transactionStatus: normalized.transactionStatus,
        fraudStatus: normalized.fraudStatus,
        bank: normalized.bank,
        vaNumber: normalized.vaNumber,
        qrCodeUrl: normalized.qrCodeUrl,
        deeplinkUrl: normalized.deeplinkUrl,
        expiryTime: normalized.expiryTime
          ? new Date(normalized.expiryTime)
          : null,
        rawResponse: res as unknown as Prisma.InputJsonValue,
      },
    });

    await this.invalidate(orderId);

    return {
      ...this.snapshot(saved),
      // Aksi dan kunci tagihan hanya ada pada respons charge; tidak disimpan
      // karena bisa diambil ulang lewat status bila benar-benar dibutuhkan.
      actions: normalized.actions,
      billKey: normalized.billKey,
      billerCode: normalized.billerCode,
    };
  }

  private expired(expiryTime: Date | null): boolean {
    return expiryTime !== null && expiryTime.getTime() <= Date.now();
  }

  // ── Membaca ─────────────────────────────────────────────────────────────

  async get(userId: string, orderId: string): Promise<PaymentSnapshot> {
    const order = await this.ownedOrderOrThrow(orderId, userId);
    if (!order.payment) {
      throw new NotFoundException('Pembayaran tidak ditemukan.');
    }
    return this.snapshot(order.payment);
  }

  /**
   * Menanyakan status langsung ke Midtrans.
   *
   * Jaring pengaman bila webhook tidak sampai — bukan jalur utama. Hasilnya
   * diperlakukan persis seperti notifikasi, lewat penerap yang sama, supaya
   * aturan "status akhir tidak turun" berlaku di kedua jalur.
   */
  async checkStatus(userId: string, orderId: string): Promise<PaymentSnapshot> {
    const order = await this.ownedOrderOrThrow(orderId, userId);
    const payment = order.payment;
    if (!payment?.midtransOrderId) {
      throw new NotFoundException('Transaksi pembayaran belum dibuat.');
    }

    const res = await this.midtrans.status(payment.midtransOrderId);
    await this.applyStatus(payment.id, orderId, res);

    return this.get(userId, orderId);
  }

  // ── Webhook ─────────────────────────────────────────────────────────────

  /**
   * Menerapkan status baru pada pembayaran dan pesanannya.
   *
   * Satu transaksi database: pembayaran yang tercatat lunas sementara
   * pesanannya tertinggal menunggu adalah keadaan yang tidak bisa dijelaskan
   * kepada siapa pun.
   */
  private async applyStatus(
    paymentId: string,
    orderId: string,
    res: MidtransChargeResponse | MidtransNotification,
  ): Promise<PaymentView | null> {
    const incoming = viewFromMidtrans(
      res.transaction_status as string,
      res.fraud_status as string | undefined,
    );

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return null;

      const current = viewFromMidtrans(
        payment.transactionStatus,
        payment.fraudStatus,
      );
      if (!shouldApply(current, incoming)) return null;

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: paymentStatusFrom(incoming),
          transactionStatus: (res.transaction_status as string) ?? null,
          fraudStatus: (res.fraud_status as string) ?? null,
          transactionId:
            (res.transaction_id as string) ?? payment.transactionId,
          paidAt: incoming === 'PAID' ? new Date() : payment.paidAt,
        },
      });

      const nextOrderStatus = orderStatusFor(incoming);
      if (nextOrderStatus) {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { status: true },
        });
        // Hanya pesanan yang masih menunggu yang ikut berpindah. Pesanan
        // yang sudah diproses tidak mundur karena notifikasi terlambat, dan
        // pembatalan pembayaran tidak membatalkan barang yang sudah dikemas.
        if (order?.status === OrderStatus.PENDING) {
          await tx.order.update({
            where: { id: orderId },
            data: { status: nextOrderStatus },
          });
        }
      }

      return incoming;
    });
  }

  /**
   * Memproses satu notifikasi Midtrans.
   *
   * Selalu menjawab tanpa melempar untuk hal-hal yang tidak bisa diperbaiki
   * dengan mengirim ulang — notifikasi yang ditolak karena tanda tangannya
   * salah tidak akan menjadi benar pada percobaan kedua. Alasannya dicatat.
   */
  async handleNotification(
    notification: MidtransNotification,
  ): Promise<{ applied: boolean; reason?: string }> {
    const reject = async (reason: string) => {
      await this.recordEvent(notification, null, reason);
      this.logger.warn(`Webhook ditolak: ${reason} (${notification.order_id})`);
      return { applied: false, reason };
    };

    if (!this.midtrans.verifySignature(notification)) {
      return reject('signature tidak sah');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { midtransOrderId: notification.order_id },
    });
    if (!payment) {
      return reject('transaksi tidak dikenal');
    }

    // Nominal dicocokkan: notifikasi yang sah untuk transaksi lain tidak
    // boleh melunasi pesanan ini.
    const expected = Math.round(Number(payment.amount));
    const got = Math.round(Number(notification.gross_amount));
    if (expected !== got) {
      return reject(`nominal tidak cocok (${got} ≠ ${expected})`);
    }

    // Idempotensi lewat unique index: notifikasi yang sama persis akan gagal
    // disimpan, dan itulah tandanya sudah pernah diproses.
    try {
      await this.recordEvent(notification, payment.id, null);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { applied: false, reason: 'sudah pernah diproses' };
      }
      throw err;
    }

    const applied = await this.applyStatus(
      payment.id,
      payment.orderId,
      notification,
    );
    if (applied) await this.invalidate(payment.orderId);

    return { applied: applied !== null };
  }

  private async recordEvent(
    notification: MidtransNotification,
    paymentId: string | null,
    rejectedReason: string | null,
  ) {
    await this.prisma.paymentWebhookEvent.create({
      data: {
        paymentId,
        midtransOrderId: notification.order_id ?? '',
        transactionId: notification.transaction_id ?? '',
        transactionStatus: notification.transaction_status ?? '',
        fraudStatus: notification.fraud_status ?? null,
        statusCode: notification.status_code ?? '',
        grossAmount: notification.gross_amount ?? '',
        payload: notification as unknown as Prisma.InputJsonValue,
        rejectedReason,
      },
    });
  }

  private async invalidate(orderId: string) {
    await this.cache
      .deletePattern(`orders:*`)
      .catch(() => undefined);
    await this.cache.delete(`order:${orderId}`).catch(() => undefined);
  }

  /** Dipakai halaman instruksi untuk tahu kapan berhenti menanyakan. */
  static isFinalView(view: PaymentView): boolean {
    return isFinal(view);
  }
}

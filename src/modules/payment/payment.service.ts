import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { MidtransService } from './midtrans.service';
import {
  type MidtransChargeResponse,
  type MidtransMethod,
  type MidtransNotification,
} from './midtrans.types';
import {
  isFinal,
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
  snapToken: string | null;
  snapRedirectUrl: string | null;
  snapClientKey: string | null;
  snapScriptUrl: string;
  snapEnvironment: 'sandbox';
}

/**
 * Pembayaran pesanan lewat Midtrans Snap Sandbox.
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

  /**
   * Menit sebelum tagihan kedaluwarsa.
   *
   * Dapat disetel lewat `MIDTRANS_EXPIRY_MINUTES`. Nilainya dipakai untuk
   * SEMUA metode — termasuk Virtual Account, yang di dunia nyata butuh lebih
   * lama karena pembeli harus membuka aplikasi banknya dan menelusuri menu.
   * Kalau nanti pembayaran VA mulai sering kedaluwarsa, naikkan nilai ini.
   */
  private readonly expiryMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly midtrans: MidtransService,
    private readonly cache: CacheService,
    config?: ConfigService,
  ) {
    this.expiryMinutes = PaymentService.readExpiryMinutes(
      config?.get<string>('MIDTRANS_EXPIRY_MINUTES'),
    );
  }

  /**
   * Membaca masa berlaku dari konfigurasi.
   *
   * Nilai yang tidak masuk akal — kosong, bukan angka, nol, atau negatif —
   * jatuh ke 15 menit alih-alih diteruskan ke Midtrans. Angka nol di sana
   * membuat tagihan kedaluwarsa sebelum sempat dibuka.
   */
  static readonly DEFAULT_EXPIRY_MINUTES = 15;

  static readExpiryMinutes(raw: string | undefined): number {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n >= 5
      ? n
      : PaymentService.DEFAULT_EXPIRY_MINUTES;
  }

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
      include: {
        payment: true,
        items: {
          include: {
            product: { select: { name: true } },
            umkmProduct: { select: { name: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan.');
    // Pesanan orang lain dijawab "tidak ditemukan": membedakannya dari
    // "terlarang" memberi tahu penebak bahwa id-nya benar.
    if (order.customerId !== userId) {
      throw new NotFoundException('Pesanan tidak ditemukan.');
    }
    return order;
  }

  private snapshot(payment: {
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
    snapToken: string | null;
    snapRedirectUrl: string | null;
  }): PaymentSnapshot {
    const status = viewFromMidtrans(
      payment.transactionStatus,
      payment.fraudStatus,
    );
    return {
      orderId: payment.orderId,
      method: payment.method,
      status,
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
      snapToken: status === 'PENDING' ? payment.snapToken : null,
      snapRedirectUrl: status === 'PENDING' ? payment.snapRedirectUrl : null,
      snapClientKey:
        status === 'PENDING' && payment.snapToken
          ? this.midtrans.publicClientKey
          : null,
      snapScriptUrl: this.midtrans.snapJsUrl,
      snapEnvironment: 'sandbox',
    };
  }

  // ── Membuat transaksi ───────────────────────────────────────────────────

  async create(
    userId: string,
    orderId: string,
    _legacyMethod?: MidtransMethod,
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
      payment.snapToken &&
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

    const res = await this.midtrans.createSnapTransaction({
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: grossAmount,
      },
      item_details: this.snapItemDetails(order.items, grossAmount),
      expiry: {
        duration: this.expiryMinutes,
        unit: 'minute',
      },
      page_expiry: {
        duration: this.expiryMinutes,
        unit: 'minute',
      },
      credit_card: { secure: true },
      customer_details: {
        first_name: customer?.name ?? 'Pelanggan',
        email: customer?.email,
        ...(customer?.phone ? { phone: customer.phone } : {}),
      },
    });

    const expiryTime = new Date(Date.now() + this.expiryMinutes * 60_000);

    const saved = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        method: PaymentMethod.MIDTRANS,
        status: PaymentStatus.PENDING,
        midtransOrderId,
        snapToken: res.token,
        snapRedirectUrl: res.redirect_url,
        transactionId: null,
        midtransPaymentType: null,
        transactionStatus: 'pending',
        fraudStatus: null,
        bank: null,
        vaNumber: null,
        qrCodeUrl: null,
        deeplinkUrl: null,
        expiryTime,
        rawResponse: res as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentMethod: PaymentMethod.MIDTRANS },
    });

    await this.invalidate(orderId);

    return this.snapshot(saved);
  }

  /** Semua produk dibekukan ke item Snap agar popup dan total dapat diaudit. */
  private snapItemDetails(
    items: Array<{
      id: string;
      productId: string | null;
      umkmProductId: string | null;
      quantity: number;
      price: Prisma.Decimal;
      product: { name: string } | null;
      umkmProduct: { name: string } | null;
    }>,
    grossAmount: number,
  ) {
    const details = items.map((item) => ({
      id: (item.productId ?? item.umkmProductId ?? item.id).slice(0, 50),
      price: Math.round(Number(item.price)),
      quantity: item.quantity,
      name: (
        item.product?.name ??
        item.umkmProduct?.name ??
        'Produk KOMIT'
      ).slice(0, 50),
    }));
    const subtotal = details.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const adjustment = grossAmount - subtotal;
    if (adjustment !== 0) {
      details.push({
        id: adjustment > 0 ? 'ORDER-FEE' : 'ORDER-DISCOUNT',
        price: adjustment,
        quantity: 1,
        name: adjustment > 0 ? 'Ongkir dan biaya' : 'Diskon pesanan',
      });
    }
    if (details.length === 0) {
      details.push({
        id: 'ORDER',
        price: grossAmount,
        quantity: 1,
        name: 'Pesanan KOMIT',
      });
    }
    return details;
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
   * Membaca status yang sudah disahkan webhook. Endpoint dipertahankan agar
   * klien lama tetap bekerja, tetapi tidak lagi memanggil Core Status API.
   */
  async checkStatus(userId: string, orderId: string): Promise<PaymentSnapshot> {
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
          midtransPaymentType:
            (res.payment_type as string) ?? payment.midtransPaymentType,
          paidAt: incoming === 'PAID' ? new Date() : payment.paidAt,
        },
      });

      const nextOrderStatus = orderStatusFor(incoming);
      if (nextOrderStatus) {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { status: true, items: true },
        });
        // Hanya pesanan yang masih menunggu yang ikut berpindah. Pesanan
        // yang sudah diproses tidak mundur karena notifikasi terlambat, dan
        // pembatalan pembayaran tidak membatalkan barang yang sudah dikemas.
        if (order?.status === OrderStatus.PENDING) {
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: nextOrderStatus,
              paymentStatus: paymentStatusFrom(incoming),
            },
          });

          if (nextOrderStatus === OrderStatus.CANCELLED) {
            for (const item of order.items) {
              if (item.productId) {
                const restored = await tx.product.update({
                  where: { id: item.productId },
                  data: { stock: { increment: item.quantity } },
                });
                await tx.inventoryTransaction.create({
                  data: {
                    productId: item.productId,
                    type: 'IN',
                    quantity: item.quantity,
                    stockAfter: restored.stock,
                    reason: `Pembayaran order #${orderId} tidak selesai`,
                  },
                });
              } else if (item.umkmProductId) {
                const restored = await tx.uMKMProduct.update({
                  where: { id: item.umkmProductId },
                  data: { stock: { increment: item.quantity } },
                });
                await tx.inventoryTransaction.create({
                  data: {
                    umkmProductId: item.umkmProductId,
                    type: 'IN',
                    quantity: item.quantity,
                    stockAfter: restored.stock,
                    reason: `Pembayaran order #${orderId} tidak selesai`,
                  },
                });
              }
            }
          }
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
    await this.cache.deletePattern(`orders:*`).catch(() => undefined);
    await this.cache.delete(`order:${orderId}`).catch(() => undefined);
  }

  /** Dipakai halaman instruksi untuk tahu kapan berhenti menanyakan. */
  static isFinalView(view: PaymentView): boolean {
    return isFinal(view);
  }
}

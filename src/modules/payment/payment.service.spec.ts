import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PaymentService } from './payment.service';

/**
 * Aturan uang.
 *
 * Yang diuji di sini bukan tampilan melainkan tiga janji: nominal selalu dari
 * database, hanya pemilik pesanan yang bisa membayarnya, dan hanya webhook
 * yang sah yang boleh menandai lunas.
 */

const OWNER = 'user-1';

function basePayment(over: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    method: 'QRIS',
    status: PaymentStatus.PENDING,
    amount: new Prisma.Decimal(50000),
    midtransOrderId: null,
    transactionId: null,
    midtransPaymentType: null,
    transactionStatus: null,
    fraudStatus: null,
    expiryTime: null,
    vaNumber: null,
    bank: null,
    qrCodeUrl: null,
    deeplinkUrl: null,
    paidAt: null,
    ...over,
  };
}

function build(over: Record<string, unknown> = {}) {
  const payment = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const prisma = {
    order: { findUnique: jest.fn(), update: jest.fn() },
    payment,
    user: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'Budi', email: 'budi@desa.co', phone: '0812',
      }),
    },
    paymentWebhookEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: never) =>
      typeof fn === 'function'
        ? (fn as unknown as (t: unknown) => unknown)({
            payment,
            order: { findUnique: jest.fn().mockResolvedValue({ status: OrderStatus.PENDING }), update: jest.fn() },
          })
        : undefined,
    ),
    ...over,
  };
  const midtrans = {
    charge: jest.fn(),
    status: jest.fn(),
    verifySignature: jest.fn().mockReturnValue(true),
  };
  const cache = {
    delete: jest.fn().mockResolvedValue(undefined),
    deletePattern: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new PaymentService(
    prisma as never,
    midtrans as never,
    cache as never,
    { get: () => '3' } as never,
  );
  return { svc, prisma, midtrans, payment };
}

const CHARGE_OK = {
  status_code: '201',
  status_message: 'ok',
  transaction_id: 'mt-1',
  order_id: 'KOMIT-order1-1700000000',
  gross_amount: '50000.00',
  payment_type: 'qris',
  transaction_status: 'pending',
  actions: [{ name: 'generate-qr-code', method: 'GET', url: 'https://mt/q.png' }],
};

describe('kepemilikan pesanan', () => {
  it('pesanan milik orang lain dijawab tidak ditemukan', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1', customerId: 'orang-lain', payment: basePayment(),
    });
    // Membedakan "terlarang" dari "tidak ada" memberi tahu penebak bahwa
    // id pesanannya benar.
    await expect(svc.create(OWNER, 'order-1', 'QRIS')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.get(OWNER, 'order-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pesanan yang tidak ada dijawab sama', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(svc.create(OWNER, 'hantu', 'QRIS')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('membuat transaksi', () => {
  function ready(over: Record<string, unknown> = {}) {
    const ctx = build();
    ctx.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      customerId: OWNER,
      status: OrderStatus.PENDING,
      payment: basePayment(over),
    });
    ctx.midtrans.charge.mockResolvedValue(CHARGE_OK);
    ctx.payment.update.mockImplementation(async ({ data }: never) =>
      basePayment({ ...(data as object) }),
    );
    return ctx;
  }

  it('nominal diambil dari database, bukan dari klien', async () => {
    const { svc, midtrans } = ready();
    await svc.create(OWNER, 'order-1', 'QRIS');
    const sent = midtrans.charge.mock.calls[0][0];
    expect(sent.transaction_details.gross_amount).toBe(50000);
  });

  it('order_id Midtrans berawalan KOMIT', async () => {
    const { svc, midtrans } = ready();
    await svc.create(OWNER, 'order-1', 'QRIS');
    expect(midtrans.charge.mock.calls[0][0].transaction_details.order_id)
      .toMatch(/^KOMIT-/);
  });

  it('menyertakan masa berlaku 3 menit', async () => {
    const { svc, midtrans } = ready();
    await svc.create(OWNER, 'order-1', 'QRIS');
    const sent = midtrans.charge.mock.calls[0][0];
    expect(sent.custom_expiry).toEqual({ expiry_duration: 3, unit: 'minute' });
    // `order_time` sengaja tidak dikirim: formatnya menuntut zona waktu
    // eksplisit, dan jam server yang meleset membuat Midtrans menolak
    // seluruh transaksi.
    expect(sent.custom_expiry).not.toHaveProperty('order_time');
  });

  it('QRIS dikirim sebagai payment_type qris', async () => {
    const { svc, midtrans } = ready();
    await svc.create(OWNER, 'order-1', 'QRIS');
    expect(midtrans.charge.mock.calls[0][0].payment_type).toBe('qris');
  });

  it('VA BCA dikirim sebagai bank_transfer', async () => {
    const { svc, midtrans } = ready();
    await svc.create(OWNER, 'order-1', 'BCA_VA');
    const sent = midtrans.charge.mock.calls[0][0];
    expect(sent.payment_type).toBe('bank_transfer');
    expect(sent.bank_transfer.bank).toBe('bca');
  });

  it('e-wallet GoPay dikirim sebagai gopay', async () => {
    const { svc, midtrans } = ready();
    await svc.create(OWNER, 'order-1', 'GOPAY');
    expect(midtrans.charge.mock.calls[0][0].payment_type).toBe('gopay');
  });

  it('klik ganda memakai ulang transaksi yang masih hidup', async () => {
    const { svc, midtrans } = ready({
      midtransOrderId: 'KOMIT-lama-1',
      method: 'QRIS',
      status: PaymentStatus.PENDING,
      expiryTime: new Date(Date.now() + 600_000),
      qrCodeUrl: 'https://mt/lama.png',
    });
    const out = await svc.create(OWNER, 'order-1', 'QRIS');
    // Tagihan kedua untuk pesanan yang sama adalah cara paling cepat
    // membuat pelanggan membayar dua kali.
    expect(midtrans.charge).not.toHaveBeenCalled();
    expect(out.midtransOrderId).toBe('KOMIT-lama-1');
  });

  it('transaksi yang sudah kedaluwarsa dibuat ulang', async () => {
    const { svc, midtrans } = ready({
      midtransOrderId: 'KOMIT-lama-1',
      expiryTime: new Date(Date.now() - 1000),
    });
    await svc.create(OWNER, 'order-1', 'QRIS');
    expect(midtrans.charge).toHaveBeenCalled();
  });

  it('ganti metode membuat transaksi baru', async () => {
    const { svc, midtrans } = ready({
      midtransOrderId: 'KOMIT-lama-1',
      method: 'QRIS',
      expiryTime: new Date(Date.now() + 600_000),
    });
    await svc.create(OWNER, 'order-1', 'BNI_VA');
    expect(midtrans.charge).toHaveBeenCalled();
  });

  it('pesanan yang sudah lunas tidak bisa ditagih lagi', async () => {
    const { svc } = ready({ status: PaymentStatus.PAID });
    await expect(svc.create(OWNER, 'order-1', 'QRIS')).rejects.toThrow(
      /sudah dibayar/i,
    );
  });

  it('Midtrans menolak charge → galat yang bisa dibaca, tanpa menyimpan apa pun', async () => {
    const ctx = ready();
    ctx.midtrans.charge.mockResolvedValue({
      status_code: '402', status_message: 'Metode tidak aktif',
    });
    await expect(ctx.svc.create(OWNER, 'order-1', 'QRIS')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ctx.payment.update).not.toHaveBeenCalled();
  });
});

describe('webhook', () => {
  const notif = {
    order_id: 'KOMIT-order1-1700000000',
    status_code: '200',
    gross_amount: '50000.00',
    signature_key: 'benar',
    transaction_id: 'mt-1',
    transaction_status: 'settlement',
  };

  function ready(over: Record<string, unknown> = {}) {
    const ctx = build();
    ctx.payment.findUnique.mockResolvedValue(
      basePayment({ midtransOrderId: notif.order_id, ...over }),
    );
    return ctx;
  }

  it('tanda tangan tidak sah ditolak dan dicatat', async () => {
    const ctx = ready();
    ctx.midtrans.verifySignature.mockReturnValue(false);
    const out = await ctx.svc.handleNotification(notif);
    expect(out.applied).toBe(false);
    expect(out.reason).toMatch(/signature/i);
    // Dicatat supaya percobaan pemalsuan bisa ditelusuri.
    expect(ctx.prisma.paymentWebhookEvent.create).toHaveBeenCalled();
  });

  it('transaksi tak dikenal ditolak', async () => {
    const ctx = build();
    ctx.payment.findUnique.mockResolvedValue(null);
    const out = await ctx.svc.handleNotification(notif);
    expect(out.reason).toMatch(/tidak dikenal/i);
  });

  it('nominal yang tidak cocok ditolak', async () => {
    const ctx = ready();
    // Notifikasi sah untuk transaksi lain tidak boleh melunasi pesanan ini.
    const out = await ctx.svc.handleNotification({ ...notif, gross_amount: '1000.00' });
    expect(out.applied).toBe(false);
    expect(out.reason).toMatch(/nominal/i);
  });

  it('notifikasi yang sama dua kali hanya diproses sekali', async () => {
    const ctx = ready();
    ctx.prisma.paymentWebhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002', clientVersion: 'x',
      }),
    );
    const out = await ctx.svc.handleNotification(notif);
    expect(out.applied).toBe(false);
    expect(out.reason).toMatch(/sudah pernah/i);
  });

  it('settlement menandai lunas dan memindahkan pesanan', async () => {
    const ctx = ready();
    const txOrder = { findUnique: jest.fn().mockResolvedValue({ status: OrderStatus.PENDING }), update: jest.fn() };
    ctx.prisma.$transaction.mockImplementation(async (fn: never) =>
      (fn as unknown as (t: unknown) => unknown)({ payment: ctx.payment, order: txOrder }),
    );
    ctx.payment.findUnique.mockResolvedValue(basePayment({ midtransOrderId: notif.order_id }));

    const out = await ctx.svc.handleNotification(notif);
    expect(out.applied).toBe(true);
    expect(ctx.payment.update).toHaveBeenCalled();
    expect(txOrder.update.mock.calls[0][0].data.status).toBe(OrderStatus.PAID);
  });

  it('pending yang datang setelah settlement tidak menurunkan status', async () => {
    const ctx = ready({ transactionStatus: 'settlement' });
    const txOrder = { findUnique: jest.fn(), update: jest.fn() };
    ctx.prisma.$transaction.mockImplementation(async (fn: never) =>
      (fn as unknown as (t: unknown) => unknown)({ payment: ctx.payment, order: txOrder }),
    );
    // Midtrans tidak menjamin urutan kedatangan notifikasi.
    const out = await ctx.svc.handleNotification({ ...notif, transaction_status: 'pending' });
    expect(out.applied).toBe(false);
    expect(ctx.payment.update).not.toHaveBeenCalled();
  });

  it('expire membatalkan pesanan yang masih menunggu', async () => {
    const ctx = ready();
    const txOrder = { findUnique: jest.fn().mockResolvedValue({ status: OrderStatus.PENDING }), update: jest.fn() };
    ctx.prisma.$transaction.mockImplementation(async (fn: never) =>
      (fn as unknown as (t: unknown) => unknown)({ payment: ctx.payment, order: txOrder }),
    );
    await ctx.svc.handleNotification({ ...notif, transaction_status: 'expire' });
    expect(txOrder.update.mock.calls[0][0].data.status).toBe(OrderStatus.CANCELLED);
  });

  it('pesanan yang sudah diproses tidak dibatalkan notifikasi terlambat', async () => {
    const ctx = ready();
    const txOrder = {
      findUnique: jest.fn().mockResolvedValue({ status: OrderStatus.PROCESSING }),
      update: jest.fn(),
    };
    ctx.prisma.$transaction.mockImplementation(async (fn: never) =>
      (fn as unknown as (t: unknown) => unknown)({ payment: ctx.payment, order: txOrder }),
    );
    await ctx.svc.handleNotification({ ...notif, transaction_status: 'expire' });
    // Barang yang sudah dikemas tidak batal karena pembayaran kedaluwarsa
    // yang datang belakangan.
    expect(txOrder.update).not.toHaveBeenCalled();
  });
});

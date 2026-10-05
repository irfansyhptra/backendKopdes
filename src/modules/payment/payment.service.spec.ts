import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PaymentService } from './payment.service';

const OWNER = 'user-1';
const SNAP_OK = {
  token: 'snap-token',
  redirect_url: 'https://app.sandbox.midtrans.com/snap/v3/redirection/x',
};

function basePayment(over: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    method: PaymentMethod.MIDTRANS,
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
    snapToken: null,
    snapRedirectUrl: null,
    ...over,
  };
}

function order(payment = basePayment(), over: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    customerId: OWNER,
    status: OrderStatus.PENDING,
    payment,
    items: [
      {
        id: 'line-1',
        productId: 'product-1',
        umkmProductId: null,
        quantity: 2,
        price: new Prisma.Decimal(25000),
        product: { name: 'Beras Premium' },
        umkmProduct: null,
      },
    ],
    ...over,
  };
}

function build() {
  const payment = { findUnique: jest.fn(), update: jest.fn() };
  const orderTx = { findUnique: jest.fn(), update: jest.fn() };
  const prisma = {
    order: { findUnique: jest.fn(), update: jest.fn() },
    payment,
    product: { update: jest.fn() },
    uMKMProduct: { update: jest.fn() },
    inventoryTransaction: { create: jest.fn() },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'Budi',
        email: 'budi@desa.co',
        phone: '0812',
      }),
    },
    paymentWebhookEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        payment,
        order: orderTx,
        product: prisma.product,
        uMKMProduct: prisma.uMKMProduct,
        inventoryTransaction: prisma.inventoryTransaction,
      }),
    ),
  };
  const midtrans = {
    createSnapTransaction: jest.fn(),
    verifySignature: jest.fn().mockReturnValue(true),
    publicClientKey: 'SB-Mid-client-publik',
    snapJsUrl: 'https://app.sandbox.midtrans.com/snap/snap.js',
  };
  const cache = {
    delete: jest.fn().mockResolvedValue(undefined),
    deletePattern: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PaymentService(
    prisma as never,
    midtrans as never,
    cache as never,
    { get: () => undefined } as never,
  );
  return { service, prisma, midtrans, payment, orderTx };
}

function ready(payment = basePayment()) {
  const context = build();
  context.prisma.order.findUnique.mockResolvedValue(order(payment));
  context.midtrans.createSnapTransaction.mockResolvedValue(SNAP_OK);
  context.payment.update.mockImplementation(async ({ data }: any) =>
    basePayment({ ...data }),
  );
  return context;
}

describe('membuat sesi Snap', () => {
  it('menyembunyikan pesanan yang bukan milik pengguna', async () => {
    const context = build();
    context.prisma.order.findUnique.mockResolvedValue(
      order(basePayment(), { customerId: 'orang-lain' }),
    );
    await expect(
      context.service.create(OWNER, 'order-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mengirim nominal database dan setiap produk ke Snap sandbox', async () => {
    const context = ready();
    const result = await context.service.create(OWNER, 'order-1');
    const sent = context.midtrans.createSnapTransaction.mock.calls[0][0];

    expect(sent.transaction_details.gross_amount).toBe(50000);
    expect(sent.transaction_details.order_id).toMatch(/^KOMIT-/);
    expect(sent.item_details).toEqual([
      {
        id: 'product-1',
        price: 25000,
        quantity: 2,
        name: 'Beras Premium',
      },
    ]);
    expect(sent.expiry).toEqual({ duration: 15, unit: 'minute' });
    expect(sent.page_expiry).toEqual({ duration: 15, unit: 'minute' });
    expect(result.snapToken).toBe(SNAP_OK.token);
    expect(result.snapRedirectUrl).toBe(SNAP_OK.redirect_url);
    expect(result.snapEnvironment).toBe('sandbox');
    expect(context.payment.update.mock.calls[0][0].data.method).toBe(
      PaymentMethod.MIDTRANS,
    );
  });

  it('memakai ulang token aktif agar klik ganda tidak membuat tagihan baru', async () => {
    const context = ready(
      basePayment({
        midtransOrderId: 'KOMIT-lama-1',
        transactionStatus: 'pending',
        snapToken: 'token-lama',
        snapRedirectUrl: 'https://app.sandbox.midtrans.com/snap/lama',
        expiryTime: new Date(Date.now() + 600_000),
      }),
    );
    const result = await context.service.create(OWNER, 'order-1');
    expect(context.midtrans.createSnapTransaction).not.toHaveBeenCalled();
    expect(result.snapToken).toBe('token-lama');
  });

  it('membuat token baru ketika sesi lama sudah kedaluwarsa', async () => {
    const context = ready(
      basePayment({
        midtransOrderId: 'KOMIT-lama-1',
        snapToken: 'token-lama',
        expiryTime: new Date(Date.now() - 1000),
      }),
    );
    await context.service.create(OWNER, 'order-1');
    expect(context.midtrans.createSnapTransaction).toHaveBeenCalledTimes(1);
  });

  it('pesanan lunas tidak dapat ditagih kembali', async () => {
    const context = ready(basePayment({ status: PaymentStatus.PAID }));
    await expect(
      context.service.create(OWNER, 'order-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('webhook sebagai sumber status', () => {
  const notification = {
    order_id: 'KOMIT-order1-1700000000',
    status_code: '200',
    gross_amount: '50000.00',
    signature_key: 'benar',
    transaction_id: 'mt-1',
    transaction_status: 'settlement',
    payment_type: 'qris',
  };

  function webhookReady(paymentOver: Record<string, unknown> = {}) {
    const context = build();
    const value = basePayment({
      midtransOrderId: notification.order_id,
      ...paymentOver,
    });
    context.payment.findUnique.mockResolvedValue(value);
    context.orderTx.findUnique.mockResolvedValue({
      status: OrderStatus.PENDING,
      items: order().items,
    });
    return context;
  }

  it('menolak signature atau nominal yang tidak cocok', async () => {
    const badSignature = webhookReady();
    badSignature.midtrans.verifySignature.mockReturnValue(false);
    await expect(
      badSignature.service.handleNotification(notification),
    ).resolves.toMatchObject({
      applied: false,
      reason: expect.stringMatching(/signature/i),
    });

    const badAmount = webhookReady();
    await expect(
      badAmount.service.handleNotification({
        ...notification,
        gross_amount: '1000.00',
      }),
    ).resolves.toMatchObject({
      applied: false,
      reason: expect.stringMatching(/nominal/i),
    });
  });

  it('settlement menandai pembayaran dan pesanan sebagai lunas', async () => {
    const context = webhookReady();
    const result = await context.service.handleNotification(notification);

    expect(result.applied).toBe(true);
    expect(context.payment.update.mock.calls[0][0].data).toMatchObject({
      status: PaymentStatus.PAID,
      transactionStatus: 'settlement',
      midtransPaymentType: 'qris',
    });
    expect(context.orderTx.update.mock.calls[0][0].data).toMatchObject({
      status: OrderStatus.PAID,
      paymentStatus: PaymentStatus.PAID,
    });
  });

  it('expiry membatalkan order dan mengembalikan stok tepat satu kali', async () => {
    const context = webhookReady();
    context.prisma.product.update.mockResolvedValue({ stock: 8 });

    await context.service.handleNotification({
      ...notification,
      transaction_status: 'expire',
    });

    expect(context.orderTx.update.mock.calls[0][0].data).toMatchObject({
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
    });
    expect(context.prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stock: { increment: 2 } },
    });
    expect(context.prisma.inventoryTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('status pending terlambat tidak menurunkan settlement', async () => {
    const context = webhookReady({ transactionStatus: 'settlement' });
    const result = await context.service.handleNotification({
      ...notification,
      transaction_status: 'pending',
    });
    expect(result.applied).toBe(false);
    expect(context.payment.update).not.toHaveBeenCalled();
  });

  it('event yang sama diproses satu kali', async () => {
    const context = webhookReady();
    context.prisma.paymentWebhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      context.service.handleNotification(notification),
    ).resolves.toMatchObject({
      applied: false,
      reason: expect.stringMatching(/pernah/i),
    });
  });
});

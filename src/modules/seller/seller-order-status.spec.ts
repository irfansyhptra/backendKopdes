import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SellerService } from './seller.service';

describe('SellerService.updateOrderStatus', () => {
  const make = (status: string) => {
    let currentStatus = status;
    const detail = (nextStatus = status) => ({
      id: 'o1',
      customerId: 'buyer-1',
      status: nextStatus,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      totalAmount: 25000,
      customer: {
        id: 'buyer-1',
        name: 'Budi',
        email: 'b@x.test',
        phone: '0812',
      },
      deliveryAddress: { street: 'Jl. Desa', city: 'Banda Aceh' },
      delivery: null,
      items: [],
    });
    const prisma: any = {
      uMKM: { findUnique: jest.fn(async () => ({ id: 'u1' })) },
      order: {
        findFirst: jest.fn(async () => detail(currentStatus)),
        update: jest.fn(async ({ data }: any) => {
          currentStatus = data.status ?? currentStatus;
          return { id: 'o1', ...data };
        }),
        // Ambil sendiri: tidak ada yang diserahkan ke kurir.
        findUnique: jest.fn(async () => ({ fulfillment: 'PICKUP' })),
      },
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    const cache: any = { delete: jest.fn(), deletePattern: jest.fn() };
    return {
      prisma,
      service: new SellerService(prisma, cache, {} as any, {} as any),
    };
  };

  it('penjual tidak bisa menandai pesanan selesai (saldo cair dari sini)', async () => {
    const { prisma, service } = make('DELIVERED');
    await expect(
      service.updateOrderStatus('user', 'o1', 'COMPLETED' as any),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('penjual tidak bisa menandai lunas atau membatalkan', async () => {
    for (const s of ['PAID', 'CANCELLED', 'DELIVERED']) {
      const { service } = make('PENDING');
      await expect(
        service.updateOrderStatus('user', 'o1', s as any),
      ).rejects.toThrow(ForbiddenException);
    }
  });

  it('menyiapkan pesanan tetap boleh, mengikuti urutan status', async () => {
    const { service } = make('PAID');
    await expect(
      service.updateOrderStatus('user', 'o1', 'PROCESSING' as any),
    ).resolves.toMatchObject({ status: 'PROCESSING' });

    const { service: s2 } = make('PENDING');
    await expect(
      s2.updateOrderStatus('user', 'o1', 'READY_FOR_DELIVERY' as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('pesanan COD PENDING dapat diproses dan responsnya tetap lengkap', async () => {
    const { service } = make('PENDING');
    await expect(
      service.updateOrderStatus('user', 'o1', 'PROCESSING' as any),
    ).resolves.toMatchObject({
      status: 'PROCESSING',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      customer: { name: 'Budi' },
      deliveryAddress: { street: 'Jl. Desa' },
      items: [],
    });
  });

  it('permintaan pengantaran membuat tugas terbuka tanpa memilih kurir', async () => {
    const { prisma, service } = make('PROCESSING');
    prisma.order.findUnique.mockResolvedValue({ fulfillment: 'DELIVERY' });
    prisma.delivery = { upsert: jest.fn(async () => ({})) };

    await service.updateOrderStatus('user', 'o1', 'READY_FOR_DELIVERY' as any);

    expect(prisma.delivery.upsert).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
      create: { orderId: 'o1', status: 'ASSIGNED' },
      update: {},
    });
    expect(prisma.delivery.upsert.mock.calls[0][0].create).not.toHaveProperty(
      'courierId',
    );
  });
});

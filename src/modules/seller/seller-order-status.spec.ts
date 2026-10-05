import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SellerService } from './seller.service';

describe('SellerService.updateOrderStatus', () => {
  const make = (status: string) => {
    const prisma: any = {
      uMKM: { findUnique: jest.fn(async () => ({ id: 'u1' })) },
      order: {
        findFirst: jest.fn(async () => ({ id: 'o1', status })),
        update: jest.fn(async ({ data }: any) => ({ id: 'o1', ...data })),
        // Ambil sendiri: tidak ada yang diserahkan ke kurir.
        findUnique: jest.fn(async () => ({ fulfillment: 'PICKUP' })),
      },
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    const cache: any = { delete: jest.fn(), deletePattern: jest.fn() };
    return { prisma, service: new SellerService(prisma, cache, {} as any, {} as any) };
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
});

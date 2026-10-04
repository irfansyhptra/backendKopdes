import { NotFoundException } from '@nestjs/common';
import { LOW_STOCK_THRESHOLD, SellerService } from './seller.service';

describe('SellerService daftar produk', () => {
  let prisma: any;
  let cache: any;
  let service: SellerService;

  beforeEach(() => {
    prisma = {
      uMKM: { findUnique: jest.fn(async () => ({ id: 'umkm-1' })) },
      uMKMProduct: {
        findMany: jest.fn(async () => [
          {
            id: 'p1',
            name: 'Sabun',
            price: { toString: () => '8000' } as any,
            stock: 3,
            reviews: [{ rating: 4 }, { rating: 5 }],
          },
        ]),
        findFirst: jest.fn(async () => null),
        // Urutan panggilan: total terfilter, aman, menipis, habis.
        count: jest
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(4),
      },
    };
    cache = { get: jest.fn(async () => null), set: jest.fn() };
    service = new SellerService(prisma, cache, {} as any);
  });

  it('filter "low" memakai rentang 1..ambang, ringkasan tidak ikut terfilter', async () => {
    const res = await service.getProducts('u1', {
      search: 'sab',
      stockStatus: 'low',
    });

    const listWhere = prisma.uMKMProduct.findMany.mock.calls[0][0].where;
    expect(listWhere.stock).toEqual({ gt: 0, lte: LOW_STOCK_THRESHOLD });

    // Hitungan ringkasan memakai pencarian, tapi bukan filter status.
    const safeWhere = prisma.uMKMProduct.count.mock.calls[1][0].where;
    expect(safeWhere.OR).toBeDefined();
    expect(safeWhere.stock).toEqual({ gt: LOW_STOCK_THRESHOLD });

    expect(res.summary).toEqual({ total: 7, safe: 2, low: 1, out: 4 });
    expect(res.lowStockThreshold).toBe(LOW_STOCK_THRESHOLD);
    expect(res.meta).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
    expect(res.products[0]).toMatchObject({ price: 8000, rating: 4.5 });
    expect(res.products[0]).not.toHaveProperty('reviews');
  });

  it('status yang tidak dikenal jatuh ke "Semua", bukan daftar kosong', async () => {
    await service.getProducts('u1', { stockStatus: 'aneh' });
    const listWhere = prisma.uMKMProduct.findMany.mock.calls[0][0].where;
    expect(listWhere.stock).toBeUndefined();
  });

  it('detail produk toko lain → tidak ditemukan', async () => {
    await expect(service.getProduct('u1', 'punya-orang')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.uMKMProduct.findFirst.mock.calls[0][0].where).toEqual({
      id: 'punya-orang',
      umkmId: 'umkm-1',
    });
  });
});

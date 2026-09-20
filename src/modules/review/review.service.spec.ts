import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReviewService } from './review.service';

describe('ReviewService', () => {
  let prisma: any;
  let service: ReviewService;

  beforeEach(() => {
    prisma = {
      review: {
        create: jest.fn(async (args: any) => ({ id: 'r1', ...args.data })),
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({ _avg: { rating: null } })),
      },
      order: { findFirst: jest.fn() },
    };
    service = new ReviewService(prisma);
  });

  describe('sasaran ulasan', () => {
    it('menolak permintaan tanpa sasaran', async () => {
      await expect(service.create('u1', { rating: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('menolak dua sasaran sekaligus', async () => {
      await expect(
        service.create('u1', {
          rating: 5,
          productId: 'p1',
          koperasiId: 'k1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ulasan Kopdes tidak butuh pesanan', async () => {
      await expect(
        service.create('u1', { rating: 4, koperasiId: 'k1' }),
      ).resolves.toMatchObject({ koperasiId: 'k1', rating: 4 });
      expect(prisma.order.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('bukti pembelian', () => {
    it('ulasan produk tanpa orderId ditolak', async () => {
      await expect(
        service.create('u1', { rating: 5, productId: 'p1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('menolak ulasan produk yang tidak ada di pesanan pengguna', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.create('u1', { rating: 5, productId: 'p1', orderId: 'o1' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('mengizinkan ulasan produk pada pesanan yang sudah diterima', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'o1' });
      await expect(
        service.create('u1', {
          rating: 5,
          productId: 'p1',
          orderId: 'o1',
          comment: '  enak  ',
        }),
      ).resolves.toMatchObject({ productId: 'p1', comment: 'enak' });
    });

    it('komentar kosong disimpan sebagai null, bukan string kosong', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'o1' });
      const created: any = await service.create('u1', {
        rating: 3,
        productId: 'p1',
        orderId: 'o1',
        comment: '   ',
      });
      expect(created.comment).toBeNull();
    });
  });

  describe('ulasan ganda', () => {
    it('pelanggaran unique dijawab 409, bukan 500', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'o1' });
      prisma.review.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.create('u1', { rating: 5, productId: 'p1', orderId: 'o1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reviewableItems', () => {
    it('kosong bila pesanan bukan milik pengguna atau belum diterima', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.reviewableItems('u1', 'o1')).resolves.toEqual({
        items: [],
      });
    });

    it('membuang produk yang sudah diulas', async () => {
      prisma.order.findFirst.mockResolvedValue({
        items: [
          {
            productId: 'p1',
            umkmProductId: null,
            product: { id: 'p1', name: 'Beras Premium 5 kg' },
            umkmProduct: null,
          },
          {
            productId: null,
            umkmProductId: 'u9',
            product: null,
            umkmProduct: { id: 'u9', name: 'Kue Adee' },
          },
        ],
      });
      prisma.review.findMany.mockResolvedValue([
        { productId: 'p1', umkmProductId: null },
      ]);

      const result = await service.reviewableItems('u1', 'o1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        umkmProductId: 'u9',
        name: 'Kue Adee',
      });
    });
  });

  describe('list', () => {
    it('menolak permintaan tanpa atau dengan dua sasaran', async () => {
      await expect(service.list({})).rejects.toThrow(BadRequestException);
      await expect(
        service.list({ productId: 'p1', umkmProductId: 'u1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('membatasi limit dan membulatkan rata-rata dua desimal', async () => {
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 4.333333 },
      });
      prisma.review.count.mockResolvedValue(3);

      const result = await service.list({ productId: 'p1', limit: 999 });
      expect(result.averageRating).toBe(4.33);
      expect(result.meta.limit).toBe(50);
    });

    it('tanpa ulasan, rata-rata null — bukan nol bintang', async () => {
      const result = await service.list({ productId: 'p1' });
      expect(result.averageRating).toBeNull();
    });
  });
});

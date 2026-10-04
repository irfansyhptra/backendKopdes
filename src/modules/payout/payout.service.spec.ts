import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PayoutService } from './payout.service';
import { splitFee } from './payout.rules';

const D = (n: number) => new Prisma.Decimal(n);

describe('PayoutService', () => {
  let prisma: any;
  let service: PayoutService;

  /** Nilai barang per golongan pesanan, sebelum fee. */
  const setOrders = (o: {
    completed?: number;
    held?: number;
    unpaid?: number;
    open?: number;
  }) =>
    prisma.$queryRaw.mockImplementation(
      async (strings: TemplateStringsArray) =>
        strings.join('').includes('FOR UPDATE')
          ? []
          : [
              {
                completed_gross: D(o.completed ?? 0),
                held_gross: D(o.held ?? 0),
                unpaid_gross: D(o.unpaid ?? 0),
                open_orders: BigInt(o.open ?? 0),
              },
            ],
    );

  beforeEach(() => {
    prisma = {
      uMKM: {
        findUnique: jest.fn(async () => ({ id: 'u1', status: 'ACTIVE' })),
      },
      uMKMBankAccount: {
        findUnique: jest.fn(async () => ({
          bankName: 'BSI',
          accountNumber: '7123456789',
          accountHolder: 'Siti',
        })),
      },
      uMKMPayout: {
        groupBy: jest.fn(async () => []),
        create: jest.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
        findFirst: jest.fn(async () => ({ id: 'p1' })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: jest.fn(async () => ({
          id: 'p1',
          amount: D(60000),
        })),
      },
      $queryRaw: jest.fn(),
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    service = new PayoutService(prisma);
  });

  it('fee 5% dibulatkan ke rupiah; bersih + fee = kotor', () => {
    expect(splitFee(100_000)).toEqual({ fee: 5_000, net: 95_000 });
    expect(splitFee(12_345)).toEqual({ fee: 617, net: 11_728 });
  });

  it('memisahkan tersedia, tertahan, dan pesanan berjalan', async () => {
    setOrders({ completed: 200_000, held: 40_000, unpaid: 20_000, open: 3 });
    prisma.uMKMPayout.groupBy.mockResolvedValue([
      { status: 'PAID', _sum: { amount: D(100_000) } },
      { status: 'REQUESTED', _sum: { amount: D(50_000) } },
    ]);

    const s = await service.summary('user');
    expect(s.completedNet).toBe(190_000);
    expect(s.available).toBe(190_000 - 100_000 - 50_000);
    expect(s.held).toBe(38_000);
    expect(s.openOrders).toEqual({ count: 3, amount: 38_000 + 19_000 });
    expect(s.bankAccount?.accountNumberMasked).toBe('•••• 6789');
    expect(s.canWithdraw).toBe(false);
    expect(s.blockers.map((b) => b.code)).toEqual([
      'PENDING_REQUEST',
      'BELOW_MINIMUM',
    ]);
  });

  it('saldo nol, tanpa rekening, belum terverifikasi → semua alasan disebut', async () => {
    setOrders({});
    prisma.uMKM.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'PENDING_VERIFICATION',
    });
    prisma.uMKMBankAccount.findUnique.mockResolvedValue(null);

    const s = await service.summary('user');
    expect(s.available).toBe(0);
    expect(s.bankAccount).toBeNull();
    expect(s.blockers.map((b) => b.code)).toEqual([
      'NOT_VERIFIED',
      'NO_BANK_ACCOUNT',
      'BELOW_MINIMUM',
    ]);
  });

  it('pengajuan: mengunci baris toko, membekukan rekening', async () => {
    setOrders({ completed: 100_000 });
    const p = await service.request('user', { amount: 60_000 });

    const lock = prisma.$queryRaw.mock.calls.find((c: any) =>
      c[0].join('').includes('FOR UPDATE'),
    );
    expect(lock).toBeDefined();
    expect(prisma.uMKMPayout.create.mock.calls[0][0].data).toMatchObject({
      amount: 60_000,
      bankName: 'BSI',
      accountNumber: '7123456789',
    });
    expect(p.accountNumber).toBe('•••• 6789');
  });

  it('menolak di atas saldo, di bawah minimum, dan tanpa rekening', async () => {
    setOrders({ completed: 100_000 }); // tersedia 95.000
    await expect(service.request('user', { amount: 96_000 })).rejects.toThrow(
      'Saldo tersedia hanya Rp95.000',
    );
    await expect(service.request('user', { amount: 40_000 })).rejects.toThrow(
      BadRequestException,
    );
    prisma.uMKMBankAccount.findUnique.mockResolvedValue(null);
    await expect(service.request('user', { amount: 60_000 })).rejects.toThrow(
      'rekening',
    );
    expect(prisma.uMKMPayout.create).not.toHaveBeenCalled();
  });

  describe('admin', () => {
    const admin = {
      id: 'a1',
      email: 'a',
      role: 'ADMIN_KOPDES' as const,
      kopdesId: 'k1',
      permissions: [],
    };

    it('hanya melihat mitra desanya', async () => {
      prisma.uMKMPayout.findMany = jest.fn(async () => []);
      prisma.uMKMPayout.count = jest.fn(async () => 0);
      await service.adminList(admin, { status: 'REQUESTED' });
      expect(prisma.uMKMPayout.findMany.mock.calls[0][0].where).toEqual({
        umkm: { kopdesId: 'k1' },
        status: 'REQUESTED',
      });
    });

    it('permintaan desa lain tidak ditemukan', async () => {
      prisma.uMKMPayout.findFirst.mockResolvedValue(null);
      await expect(service.markPaid(admin, 'p9', 'TRF1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('diproses dua kali → konflik, bukan dua transfer', async () => {
      prisma.uMKMPayout.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.markPaid(admin, 'p1', 'TRF1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.uMKMPayout.updateMany.mock.calls[0][0].where).toEqual({
        id: 'p1',
        status: 'REQUESTED',
      });
    });
  });
});

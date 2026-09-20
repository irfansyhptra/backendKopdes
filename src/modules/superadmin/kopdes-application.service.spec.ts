import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { KopdesApplicationStatus, Role } from '@prisma/client';
import { KopdesApplicationService } from './kopdes-application.service';
import { PasswordHelper } from '../auth/helpers/crypto.helper';

const FORM = {
  kopdesName: 'Kopdes Suka Maju',
  address: 'Jl. Desa 1',
  village: 'Suka Maju',
  district: 'Kuta',
  city: 'Aceh Besar',
  province: 'Aceh',
  contactName: 'Pak Budi',
  contactEmail: '  Budi@Desa.co ',
  contactPhone: '081234567890',
};

function build() {
  const prisma = {
    kopdesApplication: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'a1' }),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    user: { findUnique: jest.fn(), create: jest.fn(), groupBy: jest.fn() },
    koperasi: { create: jest.fn(), findMany: jest.fn() },
    product: { groupBy: jest.fn() },
    uMKM: { groupBy: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  return { service: new KopdesApplicationService(prisma as never), prisma };
}

describe('pengajuan koperasi', () => {
  it('menormalkan email supaya tidak lahir dua pengajuan yang sama', async () => {
    const { service, prisma } = build();
    prisma.kopdesApplication.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    await service.submit(FORM as never);

    expect(prisma.kopdesApplication.create.mock.calls[0][0].data.contactEmail)
      .toBe('budi@desa.co');
  });

  it('menolak pengajuan kedua yang masih menunggu', async () => {
    const { service, prisma } = build();
    prisma.kopdesApplication.findFirst.mockResolvedValue({ id: 'lama' });
    await expect(service.submit(FORM as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('menolak email yang sudah menjadi akun', async () => {
    const { service, prisma } = build();
    prisma.kopdesApplication.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(service.submit(FORM as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('respons publik tidak membocorkan isi pengajuan', async () => {
    const { service, prisma } = build();
    prisma.kopdesApplication.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    await service.submit(FORM as never);
    // Endpoint ini terbuka; pemohon tidak perlu apa pun selain tanda masuk.
    expect(prisma.kopdesApplication.create.mock.calls[0][0].select)
      .toEqual({ id: true, kopdesName: true, createdAt: true });
  });
});

describe('persetujuan', () => {
  const pending = {
    id: 'a1',
    status: KopdesApplicationStatus.PENDING,
    kopdesName: 'Kopdes Suka Maju',
    contactEmail: 'budi@desa.co',
    contactName: 'Pak Budi',
    contactPhone: '081234567890',
    address: 'Jl. Desa 1', village: 'Suka Maju', district: 'Kuta',
    city: 'Aceh Besar', province: 'Aceh', postalCode: null, description: null,
  };

  function approving() {
    const { service, prisma } = build();
    prisma.kopdesApplication.findUnique.mockResolvedValue(pending);
    prisma.user.findUnique.mockResolvedValue(null);
    const tx = {
      koperasi: { create: jest.fn().mockResolvedValue({ id: 'k1' }) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u1' }) },
      kopdesApplication: { update: jest.fn().mockResolvedValue({ id: 'a1' }) },
    };
    prisma.$transaction.mockImplementation((fn: never) =>
      (fn as unknown as (t: unknown) => unknown)(tx),
    );
    return { service, prisma, tx };
  }

  it('membuat koperasi dan akun adminnya dalam satu transaksi', async () => {
    const { service, prisma, tx } = approving();
    await service.approve('a1', 'super-1', { latitude: 5.5, longitude: 95.3 });

    // Koperasi tanpa pengurus tidak bisa dipakai siapa pun, dan akun admin
    // yang menunjuk koperasi tak jadi dibuat gagal di tiap permintaan.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.koperasi.create).toHaveBeenCalled();
    expect(tx.user.create.mock.calls[0][0].data.role).toBe(Role.ADMIN_KOPDES);
    expect(tx.user.create.mock.calls[0][0].data.kopdesId).toBe('k1');
  });

  it('kata sandi awal dikembalikan sekali dan hanya disimpan sebagai hash', async () => {
    const { service, tx } = approving();
    const out = await service.approve('a1', 'super-1', { latitude: 5.5, longitude: 95.3 });

    expect(out.initialPassword).toHaveLength(12);
    const stored = tx.user.create.mock.calls[0][0].data.password;
    expect(stored).not.toBe(out.initialPassword);
    expect(PasswordHelper.verify(out.initialPassword, stored)).toBe(true);
  });

  it('kata sandi acak menghindari huruf yang salah dengar', () => {
    // Dikirim lewat WhatsApp atau dibacakan; 0/O dan 1/l/I membuat pengurus
    // mengira akunnya rusak.
    const { service } = build();
    for (let i = 0; i < 50; i++) {
      const pw = (service as never as { constructor: { generatePassword(): string } })
        .constructor['generatePassword']() as string;
      expect(pw).not.toMatch(/[0O1lI]/);
    }
  });

  it('pengajuan yang sudah diputus tidak bisa disetujui dua kali', async () => {
    const { service, prisma } = build();
    prisma.kopdesApplication.findUnique.mockResolvedValue({
      ...pending, status: KopdesApplicationStatus.APPROVED,
    });
    await expect(
      service.approve('a1', 's', { latitude: 1, longitude: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pengajuan tidak dikenal ditolak', async () => {
    const { service, prisma } = build();
    prisma.kopdesApplication.findUnique.mockResolvedValue(null);
    await expect(
      service.reject('hantu', 's', { reviewNote: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('pembuatan langsung', () => {
  const FORM_DIRECT = {
    kopdesName: 'Kopdes Telepon', address: 'Jl. A', village: 'V', district: 'D',
    city: 'C', province: 'P', latitude: 5.5, longitude: 95.3,
    contactName: 'Ibu Sari', contactEmail: 'Sari@Desa.co', contactPhone: '081200000009',
  };

  function directBuild() {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    const tx = {
      koperasi: { create: jest.fn().mockResolvedValue({ id: 'k9' }) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u9' }) },
    };
    prisma.$transaction.mockImplementation((fn: never) =>
      (fn as unknown as (t: unknown) => unknown)(tx),
    );
    prisma.kopdesApplication.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    return { service, prisma, tx };
  }

  it('menghasilkan koperasi dan admin yang sama dengan jalur persetujuan', async () => {
    const { service, tx } = directBuild();
    const out = await service.createDirect('super-1', FORM_DIRECT as never);

    expect(tx.koperasi.create.mock.calls[0][0].data).toMatchObject({
      name: 'Kopdes Telepon', latitude: 5.5, longitude: 95.3,
      isActive: true, isVerified: true,
    });
    expect(tx.user.create.mock.calls[0][0].data.role).toBe(Role.ADMIN_KOPDES);
    expect(tx.user.create.mock.calls[0][0].data.kopdesId).toBe('k9');
    expect(out.initialPassword).toHaveLength(12);
  });

  it('email pengurus dinormalkan sama seperti di formulir', async () => {
    const { service, tx } = directBuild();
    await service.createDirect('super-1', FORM_DIRECT as never);
    expect(tx.user.create.mock.calls[0][0].data.email).toBe('sari@desa.co');
  });

  it('tidak membuat baris pengajuan palsu', async () => {
    const { service, prisma } = directBuild();
    await service.createDirect('super-1', FORM_DIRECT as never);
    // Koperasi yang masuk langsung memang tidak pernah mengajukan;
    // mencatatkan pengajuan palsu membuat riwayat tinjauan berbohong.
    expect(prisma.kopdesApplication.create).not.toHaveBeenCalled();
  });

  it('pengajuan menunggu dari email yang sama ikut ditutup', async () => {
    const { service, prisma } = directBuild();
    await service.createDirect('super-1', FORM_DIRECT as never);
    // Kalau tidak, pengajuannya tergantung selamanya di kotak masuk padahal
    // koperasinya sudah berdiri.
    const call = prisma.kopdesApplication.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ contactEmail: 'sari@desa.co', status: 'PENDING' });
    expect(call.data.kopdesId).toBe('k9');
  });

  it('menolak email yang sudah menjadi akun', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'ada' });
    await expect(
      service.createDirect('super-1', FORM_DIRECT as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('pemantauan koperasi', () => {
  it('hanya mengembalikan jumlah, tanpa satu pun rincian pesanan', async () => {
    const { service, prisma } = build();
    prisma.koperasi.findMany.mockResolvedValue([
      { id: 'k1', name: 'Kopdes A', village: 'A', district: 'B', city: 'C',
        province: 'D', isActive: true, isVerified: true, createdAt: new Date() },
    ]);
    prisma.product.groupBy.mockResolvedValue([{ kopdesId: 'k1', _count: { _all: 12 } }]);
    prisma.user.groupBy.mockResolvedValue([{ kopdesId: 'k1', _count: { _all: 3 } }]);
    prisma.uMKM.groupBy.mockResolvedValue([{ kopdesId: 'k1', _count: { _all: 5 } }]);
    prisma.$queryRaw.mockResolvedValue([{ kopdesId: 'k1', count: 42n }]);

    const rows = await service.kopdesStats();

    expect(rows[0].counts).toEqual({ products: 12, orders: 42, staff: 3, umkms: 5 });

    // Janji "hanya jumlah" dijaga di sini: tidak ada kolom yang bisa dipakai
    // menelusuri siapa membeli apa.
    const keys = Object.keys(rows[0]);
    for (const leaked of ['orders', 'items', 'customers', 'totalAmount', 'revenue']) {
      expect(keys).not.toContain(leaked);
    }
  });

  it('koperasi tanpa transaksi tetap muncul dengan nol', async () => {
    const { service, prisma } = build();
    prisma.koperasi.findMany.mockResolvedValue([
      { id: 'baru', name: 'Kopdes Baru', village: '', district: '', city: '',
        province: '', isActive: true, isVerified: false, createdAt: new Date() },
    ]);
    prisma.product.groupBy.mockResolvedValue([]);
    prisma.user.groupBy.mockResolvedValue([]);
    prisma.uMKM.groupBy.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    const rows = await service.kopdesStats();
    // Koperasi yang hilang dari daftar karena belum berjualan justru yang
    // paling perlu dilihat Super Admin.
    expect(rows).toHaveLength(1);
    expect(rows[0].counts).toEqual({ products: 0, orders: 0, staff: 0, umkms: 0 });
  });
});

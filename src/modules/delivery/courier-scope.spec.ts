import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DeliveryStatus, Role } from '@prisma/client';
import { DeliveryService } from './delivery.service';

/**
 * Kurir milik satu Kopdes.
 *
 * Menyaring daftar kurir di layar hanya menyembunyikan pilihannya —
 * permintaan langsung dengan id kurir desa lain tetap lolos kalau tidak
 * dijaga di service. Itu yang diuji di sini.
 */

function build() {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    delivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id: 'd1' }),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ id: 'd1' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const svc = Object.create(DeliveryService.prototype) as DeliveryService;
  Object.assign(svc, { prisma, cache: { deletePattern: jest.fn(), delete: jest.fn() } });
  return { svc, prisma };
}

describe('listCouriers', () => {
  it('disaring pada Kopdes yang diminta', async () => {
    const { svc, prisma } = build();
    await svc.listCouriers('desa-A');
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      role: Role.COURIER,
      kopdesId: 'desa-A',
    });
  });

  it('tanpa Kopdes mengembalikan semua — jalur Super Admin', async () => {
    const { svc, prisma } = build();
    await svc.listCouriers(null);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      role: Role.COURIER,
    });
  });
});

describe('assignCourier', () => {
  function ready() {
    const { svc, prisma } = build();
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      status: DeliveryStatus.ASSIGNED,
    });
    return { svc, prisma };
  }

  it('menolak kurir dari Kopdes lain meski id-nya benar', async () => {
    const { svc, prisma } = ready();
    prisma.user.findUnique.mockResolvedValue({
      id: 'c9',
      role: Role.COURIER,
      kopdesId: 'desa-B',
    });
    await expect(
      svc.assignCourier('d1', 'c9', { id: 'a1', kopdesId: 'desa-A' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.delivery.update).not.toHaveBeenCalled();
  });

  it('menerima kurir dari Kopdes yang sama', async () => {
    const { svc, prisma } = ready();
    prisma.user.findUnique.mockResolvedValue({
      id: 'c1',
      role: Role.COURIER,
      kopdesId: 'desa-A',
    });
    await svc.assignCourier('d1', 'c1', { id: 'a1', kopdesId: 'desa-A' });
    expect(prisma.delivery.update).toHaveBeenCalled();
  });

  it('akun yang bukan kurir tetap ditolak', async () => {
    const { svc, prisma } = ready();
    prisma.user.findUnique.mockResolvedValue({
      id: 'p1',
      role: Role.PEGAWAI_KOPDES,
      kopdesId: 'desa-A',
    });
    await expect(
      svc.assignCourier('d1', 'p1', { id: 'a1', kopdesId: 'desa-A' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Super Admin tanpa Kopdes boleh menugaskan kurir mana pun', async () => {
    const { svc, prisma } = ready();
    prisma.user.findUnique.mockResolvedValue({
      id: 'c9',
      role: Role.COURIER,
      kopdesId: 'desa-B',
    });
    await svc.assignCourier('d1', 'c9', { id: 's1', kopdesId: null });
    expect(prisma.delivery.update).toHaveBeenCalled();
  });
});

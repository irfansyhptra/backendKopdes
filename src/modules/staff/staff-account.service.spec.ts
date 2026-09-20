import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { StaffAccountService } from './staff-account.service';
import { ASSIGNABLE_TO_PEGAWAI, Permission, resolvePermissions } from '../../common/permissions';
import type { AuthenticatedUser } from '../auth/authenticated-request';

/**
 * Yang diuji di sini adalah batas wewenang, bukan tampilan.
 *
 * Panel Admin Kopdes menyembunyikan tombol yang tidak boleh ditekan, tetapi
 * penyembunyian itu kenyamanan. Kalau seseorang memanggil endpoint ini
 * langsung, penolakannya harus datang dari service.
 */

const admin: AuthenticatedUser = {
  id: 'admin-1',
  role: Role.ADMIN_KOPDES,
  kopdesId: 'desa-A',
  permissions: [Permission.STAFF_MANAGE],
} as AuthenticatedUser;

function build(overrides: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  };
  const cache = { delete: jest.fn().mockResolvedValue(undefined) };
  const service = new StaffAccountService(prisma as never, cache as never);
  return { service, prisma, cache };
}

describe('StaffAccountService', () => {
  it('menolak admin yang belum ditugaskan ke Kopdes mana pun', async () => {
    const { service } = build();
    const orphan = { ...admin, kopdesId: null } as AuthenticatedUser;
    await expect(service.list(orphan)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('selalu membuat PEGAWAI_KOPDES di Kopdes si admin', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'p1', role: Role.PEGAWAI_KOPDES, permissions: [], kopdesId: 'desa-A',
    });

    await service.create(admin, {
      email: 'Baru@Kopdes.co',
      password: 'rahasia123',
      name: 'Pegawai Baru',
    });

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe(Role.PEGAWAI_KOPDES);
    expect(data.kopdesId).toBe('desa-A');
    // Email disimpan huruf kecil supaya "Budi@x" dan "budi@x" tidak menjadi
    // dua akun yang keduanya bisa login.
    expect(data.email).toBe('baru@kopdes.co');
    expect(data.password).not.toBe('rahasia123');
  });

  it('menolak email yang sudah dipakai', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'lama' });
    await expect(
      service.create(admin, { email: 'a@b.co', password: 'rahasia123', name: 'A' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('tidak bisa menyentuh pegawai desa lain', async () => {
    const { service, prisma } = build();
    // findFirst menyaring dengan kopdesId, jadi pegawai desa lain tidak pernah terambil.
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.update(admin, 'pegawai-desa-B', { name: 'Ganti' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      kopdesId: 'desa-A',
      role: Role.PEGAWAI_KOPDES,
    });
  });

  it('membuang cache izin setelah wewenang diubah', async () => {
    const { service, prisma, cache } = build();
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.user.update.mockResolvedValue({
      id: 'p1', role: Role.PEGAWAI_KOPDES, permissions: [Permission.ORDER_READ],
    });

    await service.update(admin, 'p1', { permissions: [Permission.ORDER_READ] });

    // Tanpa ini pegawai yang baru dicabut wewenangnya masih bisa bekerja
    // sampai cache 60 detik PermissionsGuard kedaluwarsa.
    expect(cache.delete).toHaveBeenCalled();
  });

  it('kata sandi kosong tidak menimpa kata sandi lama', async () => {
    const { service, prisma } = build();
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.user.update.mockResolvedValue({ id: 'p1', role: Role.PEGAWAI_KOPDES, permissions: [] });

    await service.update(admin, 'p1', { name: 'Nama Baru' });

    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('password');
  });

  it('menolak admin menghapus akunnya sendiri', async () => {
    const { service } = build();
    await expect(service.remove(admin, admin.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('batas wewenang yang boleh diberikan', () => {
  it('daftar yang bisa dipilih tidak memuat wewenang admin', () => {
    for (const forbidden of [
      Permission.ORDER_CANCEL,
      Permission.PRODUCT_DELETE,
      Permission.FINANCE_READ_FULL,
      Permission.MITRA_VERIFY,
      Permission.STAFF_MANAGE,
      Permission.USER_MANAGE,
    ]) {
      expect(ASSIGNABLE_TO_PEGAWAI).not.toContain(forbidden);
    }
  });

  it('wewenang admin yang lolos ke database tetap tidak berlaku', () => {
    // Pertahanan lapis kedua: seandainya baris di database sempat berisi
    // sesuatu yang tidak semestinya, resolvePermissions menyaringnya lagi
    // terhadap bawaan peran saat izin dibaca.
    const efektif = resolvePermissions(Role.PEGAWAI_KOPDES, [
      Permission.ORDER_READ,
      Permission.STAFF_MANAGE,
      Permission.ORDER_CANCEL,
    ]);
    expect(efektif).toEqual([Permission.ORDER_READ]);
  });
});

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';

/**
 * Pendaftaran mandiri: siapa yang boleh, dan email mana yang dianggap sama.
 *
 * Form di aplikasi maupun web hanya menawarkan akun pembeli, tetapi itu
 * kenyamanan — endpoint-nya terbuka, jadi penolakannya harus datang dari
 * service.
 */

type CreatedUser = { data: { role: Role; email: string } };

/// `prisma` di sini objek biasa berisi `jest.fn()`, jadi `mock.calls` bertipe
/// `any`. Dibaca lewat satu pembantu bertipe supaya assertion-nya tetap aman.
function firstCreate(create: jest.Mock): CreatedUser {
  return (create.mock.calls as CreatedUser[][])[0][0];
}

function build() {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: { create: jest.fn().mockResolvedValue({}) },
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new AuthService(prisma as never, config as never);
  return { service, prisma };
}

const base = {
  email: 'warga@contoh.test',
  password: 'rahasia123',
  name: 'Warga Desa',
};

describe('AuthService.register', () => {
  it.each([Role.UMKM, Role.COURIER, Role.ADMIN_KOPDES, Role.SUPER_ADMIN])(
    'menolak pendaftaran mandiri sebagai %s',
    async (role) => {
      const { service, prisma } = build();
      await expect(service.register({ ...base, role })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Ditolak sebelum menyentuh basis data sama sekali.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    },
  );

  it('menerima pembeli, dan itu pula peran yang disimpan', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: base.email,
      name: base.name,
      role: Role.CUSTOMER,
      permissions: [],
    });

    await service.register(base);

    const created = firstCreate(prisma.user.create);
    expect(created.data.role).toBe(Role.CUSTOMER);
  });

  it('tanpa peran yang diminta, akun tetap lahir sebagai pembeli', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: base.email,
      role: Role.CUSTOMER,
      permissions: [],
    });

    await service.register(base);

    const created = firstCreate(prisma.user.create);
    expect(created.data.role).toBe(Role.CUSTOMER);
  });

  /**
   * `login` mencari email dengan `mode: 'insensitive'`, jadi dua ejaan yang
   * hanya beda huruf besar-kecil adalah satu orang yang sama. Tanpa
   * normalisasi di sini, keduanya lolos sebagai dua akun dan salah satunya
   * tidak akan pernah bisa masuk.
   */
  it('menormalkan email sebelum memeriksa duplikat', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'sudah-ada' });

    await expect(
      service.register({ ...base, email: '  Warga@Contoh.TEST ' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'warga@contoh.test' },
    });
  });

  it('menyimpan email yang sudah dinormalkan, bukan yang diketik', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: base.email,
      role: Role.CUSTOMER,
      permissions: [],
    });

    await service.register({ ...base, email: 'Warga@Contoh.TEST' });

    const created = firstCreate(prisma.user.create);
    expect(created.data.email).toBe('warga@contoh.test');
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';

const base = {
  email: 'warga@contoh.test',
  password: 'rahasia123',
  name: 'Warga Desa',
};

function build() {
  const pending = {
    upsert: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
  const tx = {
    user: { create: jest.fn() },
    customerEmailVerification: { delete: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    customerEmailVerification: pending,
    refreshToken: { create: jest.fn().mockResolvedValue({}) },
    koperasi: { findUnique: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const email = {
    sendCustomerVerification: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(
    prisma as never,
    config as never,
    email as never,
  );
  return { service, prisma, pending, tx, email };
}

function pendingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pending-1',
    email: base.email,
    passwordHash: 'hashed-password',
    name: base.name,
    phone: null,
    codeHash: '',
    attempts: 0,
    expiresAt: new Date(Date.now() + 600_000),
    resendAllowedAt: new Date(Date.now() - 1_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService customer email verification', () => {
  it.each([Role.UMKM, Role.COURIER, Role.ADMIN_KOPDES, Role.SUPER_ADMIN])(
    'menolak pendaftaran mandiri sebagai %s',
    async (role) => {
      const { service, prisma, pending } = build();
      await expect(service.register({ ...base, role })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(pending.upsert).not.toHaveBeenCalled();
    },
  );

  it('menormalkan email, menyimpan hash OTP, lalu mengirim kode melalui email', async () => {
    const { service, prisma, pending, email } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    const challenge = await service.register({
      ...base,
      email: '  Warga@Contoh.TEST ',
    });
    expect(challenge).toMatchObject({
      verificationRequired: true,
      email: base.email,
      expiresIn: 600,
      resendAfter: 60,
    });
    expect(pending.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: base.email } }),
    );
    const code = email.sendCustomerVerification.mock.calls[0][0].code;
    expect(code).toMatch(/^\d{6}$/);
    const stored = pending.upsert.mock.calls[0][0].create.codeHash;
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toBe(code);
  });

  it('menghapus challenge bila email gagal dikirim agar pengguna bisa mencoba lagi', async () => {
    const { service, prisma, pending, email } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    email.sendCustomerVerification.mockRejectedValue(new Error('SMTP gagal'));
    await expect(service.register(base)).rejects.toThrow('SMTP gagal');
    expect(pending.delete).toHaveBeenCalledWith({
      where: { email: base.email },
    });
  });

  it('memulihkan challenge lama bila pengiriman pengganti gagal', async () => {
    const { service, prisma, pending, email } = build();
    const previous = pendingRecord();
    prisma.user.findUnique.mockResolvedValue(null);
    pending.findUnique.mockResolvedValue(previous);
    email.sendCustomerVerification.mockRejectedValue(new Error('SMTP gagal'));

    await expect(service.register(base)).rejects.toThrow('SMTP gagal');

    expect(pending.update).toHaveBeenCalledWith({
      where: { email: base.email },
      data: expect.objectContaining({
        codeHash: previous.codeHash,
        expiresAt: previous.expiresAt,
        attempts: previous.attempts,
      }),
    });
    expect(pending.delete).not.toHaveBeenCalled();
  });

  it('menolak email yang sudah menjadi akun', async () => {
    const { service, prisma, pending } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.register(base)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(pending.upsert).not.toHaveBeenCalled();
  });

  it('kode benar baru membuat akun CUSTOMER dan menerbitkan sesi', async () => {
    const { service, prisma, pending, tx, email } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    await service.register(base);
    const code = email.sendCustomerVerification.mock.calls[0][0].code;
    const codeHash = pending.upsert.mock.calls[0][0].create.codeHash;
    pending.findUnique.mockResolvedValue(pendingRecord({ codeHash }));
    tx.user.create.mockResolvedValue({
      id: 'u1',
      email: base.email,
      name: base.name,
      phone: null,
      role: Role.CUSTOMER,
      permissions: [],
      kopdesId: null,
    });
    const result = await service.verifyCustomerEmail(base.email, code);
    expect(tx.user.create.mock.calls[0][0].data.role).toBe(Role.CUSTOMER);
    expect(tx.customerEmailVerification.delete).toHaveBeenCalledWith({
      where: { email: base.email },
    });
    expect(result.accessToken).toBeTruthy();
    expect(result.user.role).toBe(Role.CUSTOMER);
  });

  it('kode salah menambah jumlah percobaan tanpa membuat akun', async () => {
    const { service, pending, tx } = build();
    pending.findUnique.mockResolvedValue(
      pendingRecord({ codeHash: '00'.repeat(32) }),
    );
    await expect(
      service.verifyCustomerEmail(base.email, '123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pending.update).toHaveBeenCalledWith({
      where: { email: base.email },
      data: { attempts: { increment: 1 } },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('memblokir verifikasi setelah lima percobaan', async () => {
    const { service, pending } = build();
    pending.findUnique.mockResolvedValue(pendingRecord({ attempts: 5 }));
    await expect(
      service.verifyCustomerEmail(base.email, '123456'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('menolak kirim ulang selama cooldown masih aktif', async () => {
    const { service, pending, email } = build();
    pending.findUnique.mockResolvedValue(
      pendingRecord({ resendAllowedAt: new Date(Date.now() + 30_000) }),
    );
    await expect(
      service.resendCustomerEmailOtp(base.email),
    ).rejects.toBeInstanceOf(HttpException);
    expect(email.sendCustomerVerification).not.toHaveBeenCalled();
  });

  it('kirim ulang merotasi kode dan mengulang batas percobaan', async () => {
    const { service, pending, email } = build();
    const previous = pendingRecord({
      codeHash: '00'.repeat(32),
      attempts: 4,
    });
    pending.findUnique.mockResolvedValue(previous);

    const challenge = await service.resendCustomerEmailOtp(base.email);

    expect(challenge.resendAfter).toBe(60);
    expect(pending.update).toHaveBeenCalledWith({
      where: { email: base.email },
      data: expect.objectContaining({ attempts: 0 }),
    });
    const nextHash = pending.update.mock.calls[0][0].data.codeHash;
    expect(nextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(nextHash).not.toBe(previous.codeHash);
    expect(email.sendCustomerVerification).toHaveBeenCalledTimes(1);
  });
});

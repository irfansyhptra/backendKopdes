import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordHelper } from './helpers/crypto.helper';

describe('AuthService.changePassword', () => {
  const hash = PasswordHelper.hash('Lama1234');
  let prisma: any;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(async () => ({ id: 'u1', password: hash })),
        update: jest.fn(async ({ data }: any) => ({ id: 'u1', ...data })),
      },
      refreshToken: { deleteMany: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    service = new AuthService(prisma, { get: () => undefined } as any);
    jest
      .spyOn(service as any, 'generateAuthResponse')
      .mockResolvedValue({ accessToken: 'baru' });
  });

  it('sandi lama salah → 400 (bukan 401 yang mengeluarkan pengguna)', async () => {
    await expect(
      service.changePassword('u1', {
        currentPassword: 'salah',
        newPassword: 'Baru12345',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('berhasil → sesi lain dicabut, perangkat ini dapat token baru', async () => {
    const res = await service.changePassword('u1', {
      currentPassword: 'Lama1234',
      newPassword: 'Baru12345',
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    const saved = prisma.user.update.mock.calls[0][0].data.password;
    expect(PasswordHelper.verify('Baru12345', saved)).toBe(true);
    expect(res).toEqual({ accessToken: 'baru' });
  });
});

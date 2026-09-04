import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtHelper } from '../helpers/crypto.helper';

const SECRET = 'test-secret';

function contextWith(token: string) {
  const request: any = { headers: { authorization: `Bearer ${token}` } };
  return {
    request,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any,
  };
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard({
    get: () => SECRET,
  } as unknown as ConfigService);

  it('menolak token mock offline (regresi: bypass jadi SUPER_ADMIN)', async () => {
    const { ctx } = contextWith('mock_jwt_access_token_for_SUPER_ADMIN');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('menolak token mock_refreshed_access_token', async () => {
    const { ctx } = contextWith('mock_refreshed_access_token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('menolak token yang ditandatangani secret lain', async () => {
    const forged = JwtHelper.sign(
      { sub: 'u1', email: 'a@b.c', role: 'SUPER_ADMIN' },
      'secret-lain',
      60,
    );
    const { ctx } = contextWith(forged);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('menerima token asli dan mengisi request.user', async () => {
    const token = JwtHelper.sign(
      { sub: 'u1', email: 'a@b.c', role: 'CUSTOMER' },
      SECRET,
      60,
    );
    const { ctx, request } = contextWith(token);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'u1',
      email: 'a@b.c',
      role: 'CUSTOMER',
    });
  });
});

import { SellerService } from './seller.service';

describe('SellerService.getProfile', () => {
  it('tidak mengirim data akun (hash kata sandi) dan menyertakan isOpen', async () => {
    const prisma: any = {
      uMKM: {
        findUnique: jest.fn(async () => ({
          id: 'u1',
          businessName: 'AR Kopi',
          operatingHours: null,
        })),
      },
    };
    const service = new SellerService(prisma, {} as any, {} as any);
    const res = await service.getProfile('user');

    const { select } = prisma.uMKM.findUnique.mock.calls[0][0];
    expect(select.user).toBeUndefined();
    expect(Object.keys(select)).not.toContain('user');
    expect(res.isOpen).toBeNull();
  });
});

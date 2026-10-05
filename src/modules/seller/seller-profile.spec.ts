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

  it('mengunggah logo dan banner lalu menyimpan kedua URL pada toko', async () => {
    const prisma: any = {
      uMKM: {
        findUnique: jest.fn(async () => ({
          id: 'umkm-1',
          photoUrl: 'https://old.test/logo.jpg',
          bannerUrl: null,
        })),
        update: jest.fn(async ({ data }: any) => ({
          id: 'umkm-1',
          operatingHours: null,
          photoUrl: data.photoUrl,
          bannerUrl: data.bannerUrl,
        })),
      },
    };
    const cache = {
      delete: jest.fn(),
      deletePattern: jest.fn(),
    };
    const storage = {
      uploadFile: jest
        .fn()
        .mockResolvedValueOnce('https://new.test/logo.jpg')
        .mockResolvedValueOnce('https://new.test/banner.jpg'),
      deleteFile: jest.fn(),
    };
    const service = new SellerService(prisma, cache as any, storage as any);

    const result = await service.updateProfileMedia('user-1', {
      logo: [{} as Express.Multer.File],
      banner: [{} as Express.Multer.File],
    });

    expect(prisma.uMKM.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          photoUrl: 'https://new.test/logo.jpg',
          bannerUrl: 'https://new.test/banner.jpg',
        },
      }),
    );
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'https://old.test/logo.jpg',
    );
    expect(result).toMatchObject({
      photoUrl: 'https://new.test/logo.jpg',
      bannerUrl: 'https://new.test/banner.jpg',
    });
  });
});

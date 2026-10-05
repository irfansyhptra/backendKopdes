import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UmkmService } from './umkm.service';

const dto = {
  businessName: 'Keripik Mak Ijah',
  address: 'Gampong Lamgugop, Syiah Kuala',
  phone: '081234567890',
  category: 'KULINER',
  kopdesId: 'k1',
} as any;

describe('Pendaftaran & verifikasi mitra UMKM', () => {
  let prisma: any;
  let service: UmkmService;

  beforeEach(() => {
    prisma = {
      koperasi: {
        findUnique: jest.fn(async () => ({ id: 'k1', isActive: true })),
      },
      uMKM: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'u1', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'u1', ...data })),
      },
      user: { update: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    service = new UmkmService(prisma, { deletePattern: jest.fn() } as any);
  });

  it('pengajuan baru → PENDING_VERIFICATION di Kopdes yang dipilih', async () => {
    await service.apply('user-1', dto);
    expect(prisma.uMKM.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user-1',
      kopdesId: 'k1',
      status: 'PENDING_VERIFICATION',
    });
  });

  it('masih menunggu → tidak boleh mengajukan lagi', async () => {
    prisma.uMKM.findUnique.mockResolvedValueOnce({
      status: 'PENDING_VERIFICATION',
    });
    await expect(service.apply('user-1', dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('ditolak → boleh mengajukan ulang, alasan lama dihapus', async () => {
    prisma.uMKM.findUnique.mockResolvedValueOnce({ status: 'REJECTED' });
    await service.apply('user-1', dto);
    expect(prisma.uMKM.update.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING_VERIFICATION',
      rejectionReason: null,
    });
  });

  it('Kopdes nonaktif → ditolak', async () => {
    prisma.koperasi.findUnique.mockResolvedValue({ id: 'k1', isActive: false });
    await expect(service.apply('user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('disetujui → akun customer menjadi UMKM', async () => {
    prisma.uMKM.findUnique.mockResolvedValue({
      id: 'u1',
      kopdesId: 'k1',
      _count: { products: 0 },
    });
    prisma.uMKM.update.mockResolvedValue({
      id: 'u1',
      userId: 'user-1',
      user: { role: 'CUSTOMER' },
    });
    await service.verifyUmkm('u1', { status: 'ACTIVE' } as any, 'k1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: 'UMKM' },
    });
  });

  it('pengurus Kopdes lain tidak bisa memverifikasi', async () => {
    prisma.uMKM.findUnique.mockResolvedValue({ id: 'u1', kopdesId: 'k2' });
    await expect(
      service.verifyUmkm('u1', { status: 'ACTIVE' } as any, 'k1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.uMKM.update).not.toHaveBeenCalled();
  });
});

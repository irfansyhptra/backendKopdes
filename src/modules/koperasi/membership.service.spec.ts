import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';

import { MembershipService } from './membership.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Aturan verifikasi anggota.
 *
 * Yang dijaga di sini adalah dua penolakan yang tidak kelihatan di UI: seorang
 * Admin Kopdes tidak boleh menyentuh pendaftar desa lain, dan pendaftaran yang
 * sudah diputuskan tidak boleh diputuskan lagi.
 */

interface FakeMembership {
  id: string;
  kopdesId: string;
  status: MembershipStatus;
}

function serviceWith(membership: FakeMembership | null) {
  const update = jest.fn().mockResolvedValue({ id: 'm1' });
  const prisma = {
    kopdesMembership: {
      findUnique: jest.fn().mockResolvedValue(membership),
      update,
    },
  } as unknown as PrismaService;
  return { service: new MembershipService(prisma), update };
}

const pending: FakeMembership = {
  id: 'm1',
  kopdesId: 'desa-a',
  status: MembershipStatus.PENDING,
};

describe('verifikasi anggota', () => {
  it('menolak pendaftar dari koperasi lain', async () => {
    const { service, update } = serviceWith(pending);
    // Pengurus desa B membuka id milik desa A: harus tidak ditemukan, bukan
    // ditolak dengan pesan yang membocorkan bahwa datanya ada.
    await expect(
      service.review('m1', 'desa-b', 'admin-b', { status: 'ACTIVE' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('menerima keputusan pengurus koperasinya sendiri', async () => {
    const { service, update } = serviceWith(pending);
    await service.review('m1', 'desa-a', 'admin-a', { status: 'ACTIVE' });

    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe(MembershipStatus.ACTIVE);
    expect(data.reviewedById).toBe('admin-a');
    expect(data.reviewedAt).toBeInstanceOf(Date);
  });

  it('memperbolehkan Super Admin lintas desa', async () => {
    const { service, update } = serviceWith(pending);
    await service.review('m1', null, 'super', { status: 'REJECTED' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('menolak keputusan kedua atas pendaftaran yang sama', async () => {
    const { service, update } = serviceWith({
      ...pending,
      status: MembershipStatus.ACTIVE,
    });
    await expect(
      service.review('m1', 'desa-a', 'admin-a', { status: 'REJECTED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('menolak id yang tidak ada', async () => {
    const { service } = serviceWith(null);
    await expect(
      service.review('hilang', 'desa-a', 'admin-a', { status: 'ACTIVE' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('menyimpan alasan penolakan apa adanya', async () => {
    const { service, update } = serviceWith(pending);
    await service.review('m1', 'desa-a', 'admin-a', {
      status: 'REJECTED',
      reviewNote: '  Alamat di luar desa  ',
    });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.reviewNote).toBe('Alamat di luar desa');
  });

  it('alasan kosong disimpan sebagai null, bukan string kosong', async () => {
    const { service, update } = serviceWith(pending);
    await service.review('m1', 'desa-a', 'admin-a', {
      status: 'ACTIVE',
      reviewNote: '   ',
    });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.reviewNote).toBeNull();
  });
});

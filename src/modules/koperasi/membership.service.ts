import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import {
  ApplyMembershipDto,
  MembershipQueryDto,
  ReviewMembershipDto,
} from './dto/membership.dto';

/** Kolom yang boleh dibaca pemohonnya sendiri maupun pengurus. */
const SELECT = {
  id: true,
  status: true,
  fullName: true,
  phone: true,
  address: true,
  note: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  kopdesId: true,
} as const;

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Keanggotaan seorang pengguna pada satu Kopdes, atau null bila belum
   * pernah mendaftar.
   *
   * Null dibedakan dari `REJECTED`: yang pertama boleh mendaftar, yang kedua
   * harus tahu alasannya lebih dulu.
   */
  async mine(userId: string, kopdesId: string) {
    return this.prisma.kopdesMembership.findUnique({
      where: { userId_kopdesId: { userId, kopdesId } },
      select: SELECT,
    });
  }

  /**
   * Mendaftar sebagai anggota.
   *
   * Pengajuan yang ditolak boleh diulang — warga bisa memperbaiki datanya —
   * tetapi pengajuan yang masih menunggu atau sudah aktif tidak digandakan.
   */
  async apply(userId: string, kopdesId: string, dto: ApplyMembershipDto) {
    const kopdes = await this.prisma.koperasi.findFirst({
      where: { id: kopdesId, isActive: true },
      select: { id: true },
    });
    if (!kopdes) {
      throw new NotFoundException('Koperasi tidak ditemukan.');
    }

    const existing = await this.prisma.kopdesMembership.findUnique({
      where: { userId_kopdesId: { userId, kopdesId } },
      select: { id: true, status: true },
    });

    if (existing?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('Anda sudah terdaftar sebagai anggota.');
    }
    if (existing?.status === MembershipStatus.PENDING) {
      throw new ConflictException('Pendaftaran Anda masih menunggu verifikasi.');
    }

    const data = {
      fullName: dto.fullName.trim(),
      phone: dto.phone.trim(),
      address: dto.address.trim(),
      note: dto.note?.trim() || null,
      status: MembershipStatus.PENDING,
      // Pengajuan ulang mengosongkan hasil peninjauan lama; kalau tidak,
      // pemohon melihat alasan penolakan lamanya di atas pengajuan barunya.
      reviewNote: null,
      reviewedAt: null,
      reviewedById: null,
    };

    return this.prisma.kopdesMembership.upsert({
      where: { userId_kopdesId: { userId, kopdesId } },
      create: { userId, kopdesId, ...data },
      update: data,
      select: SELECT,
    });
  }

  /** Daftar pendaftar untuk panel pengurus, dibatasi pada koperasinya. */
  async list(kopdesId: string, query: MembershipQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const where: Prisma.KopdesMembershipWhereInput = {
      kopdesId,
      ...(status ? { status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.kopdesMembership.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        // Yang menunggu lebih dulu: itu satu-satunya yang menuntut tindakan.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        select: {
          ...SELECT,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.kopdesMembership.count({ where }),
    ]);

    return {
      members: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Jumlah per status, untuk lencana di panel pengurus. */
  async counts(kopdesId: string) {
    const groups = await this.prisma.kopdesMembership.groupBy({
      by: ['status'],
      where: { kopdesId },
      _count: { _all: true },
    });

    const base = { PENDING: 0, ACTIVE: 0, REJECTED: 0 };
    for (const g of groups) base[g.status] = g._count._all;
    return base;
  }

  /**
   * Menerima atau menolak pendaftaran.
   *
   * `kopdesId` datang dari token pengurus, bukan dari body: tanpa itu seorang
   * Admin Kopdes bisa memverifikasi pendaftar desa lain. `null` berarti Super
   * Admin, yang memang lintas desa.
   */
  async review(
    id: string,
    kopdesId: string | null,
    reviewerId: string,
    dto: ReviewMembershipDto,
  ) {
    const membership = await this.prisma.kopdesMembership.findUnique({
      where: { id },
      select: { id: true, kopdesId: true, status: true },
    });

    if (!membership || (kopdesId && membership.kopdesId !== kopdesId)) {
      throw new NotFoundException('Pendaftaran tidak ditemukan.');
    }
    if (membership.status !== MembershipStatus.PENDING) {
      throw new BadRequestException(
        'Pendaftaran ini sudah pernah diputuskan.',
      );
    }

    return this.prisma.kopdesMembership.update({
      where: { id },
      data: {
        status: dto.status as MembershipStatus,
        reviewNote: dto.reviewNote?.trim() || null,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
      select: {
        ...SELECT,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }
}

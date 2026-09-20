import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { KopdesApplicationStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PasswordHelper } from '../auth/helpers/crypto.helper';
import type {
  ApproveKopdesApplicationDto,
  CreateKopdesDirectDto,
  RejectKopdesApplicationDto,
  SubmitKopdesApplicationDto,
} from './dto/kopdes-application.dto';

/**
 * Pengajuan koperasi desa untuk bergabung.
 *
 * Alurnya: pengurus mengisi formulir publik → Super Admin membaca kotak
 * masuknya → menyetujui (koperasi dan akun Admin Kopdes dibuat sekaligus,
 * kata sandi awal ditampilkan sekali) atau menolak dengan alasan.
 */
@Injectable()
export class KopdesApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kata sandi awal yang mudah dibacakan lewat telepon.
   *
   * Tanpa 0/O dan 1/l/I: kata sandi ini dikirim lewat WhatsApp atau dibacakan,
   * dan satu huruf yang salah dengar membuat pengurus mengira akunnya rusak.
   * `randomInt` dipakai, bukan `Math.random`, karena ini kredensial.
   */
  private static generatePassword(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 12; i++) {
      out += alphabet[crypto.randomInt(alphabet.length)];
    }
    return out;
  }

  private static normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  // ── Publik ──────────────────────────────────────────────────────────────

  async submit(dto: SubmitKopdesApplicationDto) {
    const contactEmail = KopdesApplicationService.normalizeEmail(
      dto.contactEmail,
    );

    // Pengajuan ganda yang masih menunggu ditolak, tetapi pengajuan baru
    // setelah sebelumnya ditolak tetap boleh — koperasi yang melengkapi
    // datanya harus punya kesempatan kedua.
    const pending = await this.prisma.kopdesApplication.findFirst({
      where: { contactEmail, status: KopdesApplicationStatus.PENDING },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException(
        'Pengajuan dengan email ini masih menunggu ditinjau.',
      );
    }

    const taken = await this.prisma.user.findUnique({
      where: { email: contactEmail },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException(
        'Email ini sudah terdaftar sebagai akun. Silakan masuk.',
      );
    }

    const created = await this.prisma.kopdesApplication.create({
      data: {
        kopdesName: dto.kopdesName.trim(),
        description: dto.description?.trim() || null,
        address: dto.address.trim(),
        village: dto.village.trim(),
        district: dto.district.trim(),
        city: dto.city.trim(),
        province: dto.province.trim(),
        postalCode: dto.postalCode?.trim() || null,
        contactName: dto.contactName.trim(),
        contactEmail,
        contactPhone: dto.contactPhone.trim(),
        notes: dto.notes?.trim() || null,
      },
      select: { id: true, kopdesName: true, createdAt: true },
    });

    // Sengaja tidak mengembalikan seluruh baris: endpoint ini publik, dan
    // pemohon tidak perlu apa pun selain tanda bahwa pengajuannya masuk.
    return created;
  }

  // ── Super Admin ─────────────────────────────────────────────────────────

  async list(status?: KopdesApplicationStatus) {
    return this.prisma.kopdesApplication.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async counts() {
    const rows = await this.prisma.kopdesApplication.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const out: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const r of rows) out[r.status] = r._count._all;
    return out;
  }

  private async pendingOrThrow(id: string) {
    const app = await this.prisma.kopdesApplication.findUnique({
      where: { id },
    });
    if (!app) throw new NotFoundException('Pengajuan tidak ditemukan.');
    if (app.status !== KopdesApplicationStatus.PENDING) {
      throw new BadRequestException(
        `Pengajuan ini sudah ${app.status === 'APPROVED' ? 'disetujui' : 'ditolak'}.`,
      );
    }
    return app;
  }

  /**
   * Menyetujui: membuat Koperasi dan akun Admin Kopdes-nya sekaligus.
   *
   * Keduanya dalam satu transaksi. Koperasi yang berdiri tanpa pengurus tidak
   * bisa dipakai siapa pun, dan akun admin yang menunjuk koperasi tak jadi
   * dibuat akan gagal di setiap permintaan dashboard.
   *
   * Kata sandi awal dikembalikan SATU KALI di sini. Setelah respons ini
   * berlalu tidak ada cara membacanya lagi — yang tersimpan hanya hash-nya —
   * jadi Super Admin harus menyalinnya sebelum menutup halaman.
   */
  /**
   * Koperasi beserta pengurusnya, dalam satu transaksi.
   *
   * Dipakai dua jalur: persetujuan pengajuan, dan pembuatan langsung oleh
   * Super Admin. Keduanya harus menghasilkan keadaan yang persis sama —
   * menyalin logikanya akan membuat salah satu jalur pelan-pelan berbeda.
   */
  private async createKopdesWithAdmin(
    tx: Prisma.TransactionClient,
    input: {
      kopdesName: string;
      description?: string | null;
      address: string;
      village: string;
      district: string;
      city: string;
      province: string;
      postalCode?: string | null;
      latitude: number;
      longitude: number;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
    },
    initialPassword: string,
  ) {
    const kopdes = await tx.koperasi.create({
      data: {
        name: input.kopdesName,
        description: input.description ?? null,
        address: input.address,
        village: input.village,
        district: input.district,
        city: input.city,
        province: input.province,
        postalCode: input.postalCode ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        phone: input.contactPhone,
        isActive: true,
        // Diverifikasi karena Super Admin baru saja memeriksanya sendiri.
        isVerified: true,
      },
    });

    const admin = await tx.user.create({
      data: {
        email: input.contactEmail,
        password: PasswordHelper.hash(initialPassword),
        name: input.contactName,
        phone: input.contactPhone,
        role: Role.ADMIN_KOPDES,
        kopdesId: kopdes.id,
        // Kosong = pakai bawaan peran Admin Kopdes.
        permissions: [],
      },
      select: { id: true, email: true, name: true, role: true },
    });

    return { kopdes, admin };
  }

  /** Email pengurus belum boleh dipakai akun mana pun. */
  private async assertEmailFree(email: string) {
    const taken = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('Email pengurus sudah dipakai akun lain.');
    }
  }

  /**
   * Membuat koperasi tanpa melewati formulir pengajuan.
   *
   * Untuk permintaan yang datang langsung — lewat telepon, surat, atau tatap
   * muka — ketika mengharuskan pengurus mengisi formulir hanya menambah
   * langkah tanpa menambah keyakinan: Super Admin toh sudah berbicara dengan
   * orangnya.
   *
   * Tidak ada baris KopdesApplication yang dibuat-buat untuk ini. Koperasi
   * yang masuk langsung memang tidak pernah mengajukan, dan mencatatkan
   * pengajuan palsu akan membuat riwayat tinjauan berbohong.
   */
  async createDirect(actorId: string, dto: CreateKopdesDirectDto) {
    const contactEmail = KopdesApplicationService.normalizeEmail(
      dto.contactEmail,
    );
    await this.assertEmailFree(contactEmail);

    const initialPassword =
      dto.initialPassword ?? KopdesApplicationService.generatePassword();

    const result = await this.prisma.$transaction((tx) =>
      this.createKopdesWithAdmin(
        tx,
        { ...dto, contactEmail },
        initialPassword,
      ),
    );

    // Pengajuan yang masih menunggu dari email yang sama menjadi tidak
    // relevan: koperasinya sudah berdiri lewat jalur lain.
    await this.prisma.kopdesApplication.updateMany({
      where: { contactEmail, status: KopdesApplicationStatus.PENDING },
      data: {
        status: KopdesApplicationStatus.APPROVED,
        reviewNote: 'Koperasi dibuat langsung oleh pengurus sistem.',
        reviewedAt: new Date(),
        reviewedBy: actorId,
        kopdesId: result.kopdes.id,
      },
    });

    return { ...result, initialPassword };
  }

  async approve(
    id: string,
    reviewerId: string,
    dto: ApproveKopdesApplicationDto,
  ) {
    const app = await this.pendingOrThrow(id);

    const taken = await this.prisma.user.findUnique({
      where: { email: app.contactEmail },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException(
        'Email pengurus sudah dipakai akun lain. Tolak pengajuan ini atau minta email lain.',
      );
    }

    const initialPassword =
      dto.initialPassword ?? KopdesApplicationService.generatePassword();

    const result = await this.prisma.$transaction(async (tx) => {
      const { kopdes, admin } = await this.createKopdesWithAdmin(
        tx,
        { ...app, latitude: dto.latitude, longitude: dto.longitude },
        initialPassword,
      );

      const application = await tx.kopdesApplication.update({
        where: { id },
        data: {
          status: KopdesApplicationStatus.APPROVED,
          reviewNote: dto.reviewNote?.trim() || null,
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
          kopdesId: kopdes.id,
        },
      });

      return { kopdes, admin, application };
    });

    return {
      ...result,
      /// Hanya ada di respons ini. Teruskan lewat email atau WhatsApp,
      /// lalu minta pengurus menggantinya setelah masuk.
      initialPassword,
    };
  }

  async reject(
    id: string,
    reviewerId: string,
    dto: RejectKopdesApplicationDto,
  ) {
    await this.pendingOrThrow(id);
    return this.prisma.kopdesApplication.update({
      where: { id },
      data: {
        status: KopdesApplicationStatus.REJECTED,
        reviewNote: dto.reviewNote.trim(),
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      },
    });
  }

  // ── Pemantauan ──────────────────────────────────────────────────────────

  /**
   * Jumlah per koperasi — **hanya jumlah**.
   *
   * Super Admin memantau apakah sebuah koperasi hidup dan seberapa sibuk,
   * bukan siapa membeli apa. Karena itu di sini tidak ada satu pun baris
   * pesanan, nama pelanggan, maupun nominal transaksi: yang dikembalikan
   * angka agregat, dan tidak ada parameter yang bisa membukanya lebih dalam.
   */
  async kopdesStats() {
    const [kopdesList, products, orders, staff, umkms] = await Promise.all([
      this.prisma.koperasi.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          village: true,
          district: true,
          city: true,
          province: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
        },
      }),
      this.prisma.product.groupBy({
        by: ['kopdesId'],
        _count: { _all: true },
      }),
      // Pesanan tidak menyimpan kopdesId; ia ditelusuri lewat baris
      // pesanannya, sama seperti `OrderService.kopdesScope`. Raw query dipakai
      // karena `groupBy` tidak bisa menghitung pesanan unik lewat relasi
      // bertingkat.
      //
      // COUNT(DISTINCT) penting: satu pesanan yang memuat barang Kopdes dan
      // barang mitranya sekaligus tetap satu pesanan, bukan dua.
      this.prisma.$queryRaw<{ kopdesId: string; count: bigint }[]>(Prisma.sql`
        SELECT kid AS "kopdesId", COUNT(DISTINCT "orderId") AS count
        FROM (
          SELECT oi."orderId", p."kopdesId" AS kid
          FROM "OrderItem" oi
          JOIN "Product" p ON p."id" = oi."productId"
          WHERE p."kopdesId" IS NOT NULL
          UNION ALL
          SELECT oi."orderId", u."kopdesId" AS kid
          FROM "OrderItem" oi
          JOIN "UMKMProduct" up ON up."id" = oi."umkmProductId"
          JOIN "UMKM" u ON u."id" = up."umkmId"
          WHERE u."kopdesId" IS NOT NULL
        ) t
        GROUP BY kid
      `),
      this.prisma.user.groupBy({
        by: ['kopdesId'],
        where: { role: { in: [Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES] } },
        _count: { _all: true },
      }),
      this.prisma.uMKM.groupBy({
        by: ['kopdesId'],
        _count: { _all: true },
      }),
    ]);

    const tally = (
      rows: { kopdesId: string | null; _count: { _all: number } }[],
    ) => new Map(rows.map((r) => [r.kopdesId, r._count._all]));

    const productCount = tally(products);
    const staffCount = tally(staff);
    const umkmCount = tally(umkms);
    const orderCount = new Map(
      orders.map((r) => [r.kopdesId, Number(r.count)]),
    );

    return kopdesList.map((k) => ({
      ...k,
      counts: {
        products: productCount.get(k.id) ?? 0,
        orders: orderCount.get(k.id) ?? 0,
        staff: staffCount.get(k.id) ?? 0,
        umkms: umkmCount.get(k.id) ?? 0,
      },
    }));
  }
}

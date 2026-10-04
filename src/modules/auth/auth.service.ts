import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtHelper, PasswordHelper } from './helpers/crypto.helper';
import { resolvePermissions } from '../../common/permissions';

/**
 * Hanya pembeli yang boleh mendaftar sendiri.
 *
 * UMKM dan kurir sempat ada di daftar ini, dan keduanya menghasilkan akun
 * yang tidak bisa dipakai:
 *
 * - UMKM: tidak ada satu pun jalur yang membuat baris `UMKM` selain seed,
 *   jadi akun berperan UMKM lahir tanpa profil usaha, tanpa Kopdes induk,
 *   dan tanpa melewati verifikasi Admin Kopdes yang justru menjadi syarat
 *   berjualan.
 * - COURIER: kurir adalah staf Kopdes — dibuat lewat modul staf yang
 *   sekaligus mengikatnya ke satu desa. Kurir yang mendaftar sendiri tidak
 *   punya `kopdesId`, sehingga tidak pernah muncul di daftar kurir desa mana
 *   pun dan tidak ada pesanan yang bisa diberikan kepadanya.
 */
const SELF_REGISTER_ROLES: Role[] = [Role.CUSTOMER];

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: number; // in seconds
  private readonly refreshExpiresIn: number; // in seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') || 'default_jwt_secret';

    // Bentuknya "15m", "7d", "365d".
    const accessExpires =
      this.configService.get<string>('JWT_EXPIRES_IN') || '15m';

    /**
     * Setahun, bukan seminggu.
     *
     * Refresh token DIROTASI setiap kali dipakai — tiap penyegaran
     * menerbitkan token baru berumur penuh. Jadi pengguna yang membuka
     * aplikasi sesekali tidak akan pernah keluar sendiri; batas ini hanya
     * menggigit orang yang tidak membuka aplikasi sama sekali selama satu
     * tahun penuh.
     *
     * Tujuh hari dulu terasa aman, tapi untuk aplikasi belanja desa yang
     * dibuka beberapa kali sebulan, itu berarti login ulang berkala tanpa
     * alasan yang bisa dijelaskan ke penggunanya.
     */
    const refreshExpires =
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '365d';

    this.jwtExpiresIn = this.parseDuration(accessExpires, 900); // 15m
    this.refreshExpiresIn = this.parseDuration(refreshExpires, 31536000); // 365d
  }

  private parseDuration(duration: string, fallback: number): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return fallback;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return fallback;
    }
  }

  async register(dto: RegisterDto) {
    // Cegah eskalasi hak akses lewat pendaftaran mandiri.
    const requestedRole = dto.role ?? Role.CUSTOMER;
    if (!SELF_REGISTER_ROLES.includes(requestedRole)) {
      throw new ForbiddenException(
        'Pendaftaran mandiri hanya untuk akun pembeli. Mitra UMKM mengajukan ' +
          'diri lewat Kopdes desanya, dan akun kurir maupun pegawai dibuat ' +
          'oleh pengurus Kopdes.',
      );
    }

    /**
     * Email dinormalkan sebelum apa pun.
     *
     * `login` mencarinya dengan `mode: 'insensitive'`, sementara pemeriksaan
     * duplikat di sini memakai indeks unik yang peka huruf besar-kecil.
     * Tanpa normalisasi, "Budi@Mail.com" dan "budi@mail.com" lolos sebagai
     * dua akun berbeda — lalu login mengembalikan salah satunya secara
     * sembarang, dan pemilik akun yang lain tidak pernah bisa masuk.
     */
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const hashedPassword = PasswordHelper.hash(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: dto.name.trim(),
          phone: dto.phone?.trim() || null,
          role: requestedRole,
        },
      });

      return this.generateAuthResponse(user);
    } catch (e) {
      // Dua pendaftaran serentak sama-sama lolos pemeriksaan di atas; yang
      // kalah ditolak indeks unik. Itu tetap "email sudah terdaftar", bukan
      // galat server.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email sudah terdaftar');
      }
      throw e;
    }
  }

  async login(dto: LoginDto) {
    if (!dto.email || !dto.password) {
      throw new UnauthorizedException('Email dan password wajib diisi');
    }

    const cleanEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: 'insensitive',
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const isMatch = PasswordHelper.verify(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Email atau password salah');
    }

    return this.generateAuthResponse(user);
  }

  async refresh(refreshToken: string) {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await this.prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate refresh token
    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
    return this.generateAuthResponse(storedToken.user);
  }

  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!PasswordHelper.verify(dto.currentPassword, user.password)) {
      // 400, bukan 401: 401 membuat aplikasi menganggap sesinya habis dan
      // mengeluarkan pengguna, padahal ia hanya salah ketik.
      throw new BadRequestException('Kata sandi saat ini salah.');
    }
    if (PasswordHelper.verify(dto.newPassword, user.password)) {
      throw new BadRequestException(
        'Kata sandi baru harus berbeda dari yang sekarang.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Kata sandi diganti biasanya karena khawatir ada yang tahu: semua
      // refresh token lama dicabut, jadi perangkat lain keluar.
      await tx.refreshToken.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: { password: PasswordHelper.hash(dto.newPassword) },
      });
    });
    return this.generateAuthResponse(updated);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        kopdesId: true,
        permissions: true,
        kopdes: { select: { id: true, name: true, village: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { permissions, ...rest } = user;
    return {
      ...rest,
      // Permission efektif, bukan isi kolom mentah: kolom kosong berarti
      // "pakai bawaan role", dan klien tidak boleh menerjemahkan itu sendiri.
      permissions: resolvePermissions(user.role, permissions),
    };
  }

  async updateProfile(userId: string, data: { name: string; phone?: string }) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        phone: data.phone,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return updated;
  }

  private async generateAuthResponse(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = JwtHelper.sign(
      payload,
      this.jwtSecret,
      this.jwtExpiresIn,
    );
    const refreshToken = crypto.randomUUID
      ? crypto.randomUUID()
      : require('crypto').randomBytes(32).toString('hex');

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.refreshExpiresIn);

    // Save refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    const kopdes = user.kopdesId
      ? await this.prisma.koperasi.findUnique({
          where: { id: user.kopdesId },
          select: { id: true, name: true, village: true },
        })
      : null;

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        kopdesId: user.kopdesId ?? null,
        kopdes,
        permissions: resolvePermissions(user.role, user.permissions),
      },
    };
  }
}

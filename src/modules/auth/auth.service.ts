import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtHelper, PasswordHelper } from './helpers/crypto.helper';
import { resolvePermissions } from '../../common/permissions';
import { AuthEmailService } from './auth-email.service';
import { StorageService } from '../../storage/storage.service';

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
const OTP_EXPIRES_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: number; // in seconds
  private readonly refreshExpiresIn: number; // in seconds
  private readonly otpSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: AuthEmailService,
    private readonly storage: StorageService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') || 'default_jwt_secret';
    this.otpSecret =
      this.configService.get<string>('OTP_SECRET') ||
      `${this.jwtSecret}:customer-email-verification`;

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

    const previous = await this.prisma.customerEmailVerification.findUnique({
      where: { email },
    });
    const currentTime = new Date();
    if (
      previous &&
      previous.expiresAt > currentTime &&
      previous.resendAllowedAt > currentTime
    ) {
      const seconds = Math.ceil(
        (previous.resendAllowedAt.getTime() - currentTime.getTime()) / 1000,
      );
      throw new HttpException(
        `Kode sudah dikirim. Coba lagi dalam ${seconds} detik.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.createOtp();
    const passwordHash = PasswordHelper.hash(dto.password);
    const now = currentTime;
    const expiresAt = new Date(now.getTime() + OTP_EXPIRES_MINUTES * 60_000);
    const resendAllowedAt = new Date(now.getTime() + OTP_RESEND_SECONDS * 1000);

    await this.prisma.customerEmailVerification.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        codeHash: this.hashOtp(email, code),
        expiresAt,
        resendAllowedAt,
      },
      update: {
        passwordHash,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        codeHash: this.hashOtp(email, code),
        expiresAt,
        resendAllowedAt,
        attempts: 0,
      },
    });

    try {
      await this.emailService.sendCustomerVerification({
        email,
        name: dto.name.trim(),
        code,
        expiresInMinutes: OTP_EXPIRES_MINUTES,
      });
    } catch (error) {
      // Pendaftaran tidak boleh tertahan oleh kode yang tidak pernah sampai.
      // Jika ini pengiriman ulang melalui form daftar, pertahankan kode lama
      // yang masih tersimpan agar gangguan SMTP tidak merusak challenge itu.
      if (previous) {
        await this.prisma.customerEmailVerification
          .update({
            where: { email },
            data: {
              passwordHash: previous.passwordHash,
              name: previous.name,
              phone: previous.phone,
              codeHash: previous.codeHash,
              expiresAt: previous.expiresAt,
              resendAllowedAt: previous.resendAllowedAt,
              attempts: previous.attempts,
            },
          })
          .catch(() => undefined);
      } else {
        await this.prisma.customerEmailVerification
          .delete({ where: { email } })
          .catch(() => undefined);
      }
      throw error;
    }

    return this.verificationChallenge(email);
  }

  async verifyCustomerEmail(emailInput: string, code: string) {
    const email = emailInput.trim().toLowerCase();
    const pending = await this.prisma.customerEmailVerification.findUnique({
      where: { email },
    });

    if (!pending || pending.expiresAt <= new Date()) {
      if (pending) {
        await this.prisma.customerEmailVerification.delete({
          where: { email },
        });
      }
      throw new BadRequestException(
        'Kode verifikasi sudah kedaluwarsa. Daftarkan akun kembali.',
      );
    }
    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpException(
        'Terlalu banyak percobaan. Kirim ulang kode untuk melanjutkan.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expected = Buffer.from(pending.codeHash, 'hex');
    const received = Buffer.from(this.hashOtp(email, code), 'hex');
    const matches =
      expected.length === received.length &&
      timingSafeEqual(expected, received);
    if (!matches) {
      await this.prisma.customerEmailVerification.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Kode verifikasi tidak tepat.');
    }

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: pending.email,
            password: pending.passwordHash,
            name: pending.name,
            phone: pending.phone,
            role: Role.CUSTOMER,
          },
        });
        await tx.customerEmailVerification.delete({ where: { email } });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email sudah terdaftar');
      }
      throw error;
    }

    return this.generateAuthResponse(user);
  }

  async resendCustomerEmailOtp(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const pending = await this.prisma.customerEmailVerification.findUnique({
      where: { email },
    });
    if (!pending || pending.expiresAt <= new Date()) {
      throw new BadRequestException(
        'Pendaftaran tidak ditemukan atau sudah kedaluwarsa. Daftarkan akun kembali.',
      );
    }

    const now = new Date();
    if (pending.resendAllowedAt > now) {
      const seconds = Math.ceil(
        (pending.resendAllowedAt.getTime() - now.getTime()) / 1000,
      );
      throw new HttpException(
        `Kode baru dapat dikirim dalam ${seconds} detik.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.createOtp();
    const expiresAt = new Date(now.getTime() + OTP_EXPIRES_MINUTES * 60_000);
    const resendAllowedAt = new Date(now.getTime() + OTP_RESEND_SECONDS * 1000);
    await this.prisma.customerEmailVerification.update({
      where: { email },
      data: {
        codeHash: this.hashOtp(email, code),
        expiresAt,
        resendAllowedAt,
        attempts: 0,
      },
    });

    try {
      await this.emailService.sendCustomerVerification({
        email,
        name: pending.name,
        code,
        expiresInMinutes: OTP_EXPIRES_MINUTES,
      });
    } catch (error) {
      await this.prisma.customerEmailVerification.update({
        where: { email },
        data: {
          codeHash: pending.codeHash,
          expiresAt: pending.expiresAt,
          resendAllowedAt: pending.resendAllowedAt,
          attempts: pending.attempts,
        },
      });
      throw error;
    }
    return this.verificationChallenge(email);
  }

  private createOtp() {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashOtp(email: string, code: string) {
    return createHmac('sha256', this.otpSecret)
      .update(`customer:${email}:${code}`)
      .digest('hex');
  }

  private verificationChallenge(email: string) {
    return {
      verificationRequired: true as const,
      email,
      expiresIn: OTP_EXPIRES_MINUTES * 60,
      resendAfter: OTP_RESEND_SECONDS,
    };
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
        avatarUrl: true,
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
        avatarUrl: true,
        role: true,
        kopdesId: true,
        permissions: true,
        kopdes: { select: { id: true, name: true, village: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
    const { permissions, ...rest } = updated;
    return {
      ...rest,
      permissions: resolvePermissions(updated.role, permissions),
    };
  }

  async updateAvatar(userId: string, avatar?: Express.Multer.File) {
    if (!avatar) {
      throw new BadRequestException('Pilih foto profil terlebih dahulu.');
    }
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!current) throw new NotFoundException('User not found');

    const uploaded = await this.storage.uploadFile(
      avatar,
      `profiles/${userId}`,
    );
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: uploaded },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatarUrl: true,
          role: true,
          kopdesId: true,
          permissions: true,
          kopdes: { select: { id: true, name: true, village: true } },
          createdAt: true,
          updatedAt: true,
        },
      });
      if (current.avatarUrl && current.avatarUrl !== uploaded) {
        await this.storage.deleteFile(current.avatarUrl);
      }
      const { permissions, ...rest } = updated;
      return {
        ...rest,
        permissions: resolvePermissions(updated.role, permissions),
      };
    } catch (error) {
      await this.storage.deleteFile(uploaded);
      throw error;
    }
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
        avatarUrl: user.avatarUrl ?? null,
        role: user.role,
        kopdesId: user.kopdesId ?? null,
        kopdes,
        permissions: resolvePermissions(user.role, user.permissions),
      },
    };
  }
}

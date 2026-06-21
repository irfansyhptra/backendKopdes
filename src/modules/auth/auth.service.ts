import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtHelper, PasswordHelper } from './helpers/crypto.helper';

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
    
    // Parse duration like "15m" or "7d"
    const accessExpires = this.configService.get<string>('JWT_EXPIRES_IN') || '15m';
    const refreshExpires = this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '7d';
    
    this.jwtExpiresIn = this.parseDuration(accessExpires, 900); // default 15m
    this.refreshExpiresIn = this.parseDuration(refreshExpires, 604800); // default 7d
  }

  private parseDuration(duration: string, fallback: number): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return fallback;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return fallback;
    }
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = PasswordHelper.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        phone: dto.phone,
        role: dto.role ?? 'CUSTOMER',
      },
    });

    return this.generateAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = PasswordHelper.verify(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
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
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate refresh token
    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
    return this.generateAuthResponse(storedToken.user);
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
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
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

    const accessToken = JwtHelper.sign(payload, this.jwtSecret, this.jwtExpiresIn);
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

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  }
}

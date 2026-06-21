"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const config_1 = require("@nestjs/config");
const crypto_helper_1 = require("./helpers/crypto.helper");
let AuthService = class AuthService {
    prisma;
    configService;
    jwtSecret;
    jwtExpiresIn;
    refreshExpiresIn;
    constructor(prisma, configService) {
        this.prisma = prisma;
        this.configService = configService;
        this.jwtSecret =
            this.configService.get('JWT_SECRET') || 'default_jwt_secret';
        const accessExpires = this.configService.get('JWT_EXPIRES_IN') || '15m';
        const refreshExpires = this.configService.get('REFRESH_TOKEN_EXPIRES_IN') || '7d';
        this.jwtExpiresIn = this.parseDuration(accessExpires, 900);
        this.refreshExpiresIn = this.parseDuration(refreshExpires, 604800);
    }
    parseDuration(duration, fallback) {
        const match = duration.match(/^(\d+)([smhd])$/);
        if (!match)
            return fallback;
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
    async register(dto) {
        const existing = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (existing) {
            throw new common_1.ConflictException('Email already registered');
        }
        const hashedPassword = crypto_helper_1.PasswordHelper.hash(dto.password);
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
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        const isMatch = crypto_helper_1.PasswordHelper.verify(dto.password, user.password);
        if (!isMatch) {
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        return this.generateAuthResponse(user);
    }
    async refresh(refreshToken) {
        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });
        if (!storedToken || storedToken.expiresAt < new Date()) {
            if (storedToken) {
                await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
            }
            throw new common_1.UnauthorizedException('Invalid or expired refresh token');
        }
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return this.generateAuthResponse(storedToken.user);
    }
    async me(userId) {
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
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async updateProfile(userId, data) {
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
    async generateAuthResponse(user) {
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
        };
        const accessToken = crypto_helper_1.JwtHelper.sign(payload, this.jwtSecret, this.jwtExpiresIn);
        const refreshToken = crypto.randomUUID
            ? crypto.randomUUID()
            : require('crypto').randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + this.refreshExpiresIn);
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly configService;
    private readonly jwtSecret;
    private readonly jwtExpiresIn;
    private readonly refreshExpiresIn;
    constructor(prisma: PrismaService, configService: ConfigService);
    private parseDuration;
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: any;
        user: {
            id: any;
            email: any;
            name: any;
            phone: any;
            role: any;
        };
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: any;
        user: {
            id: any;
            email: any;
            name: any;
            phone: any;
            role: any;
        };
    }>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: any;
        user: {
            id: any;
            email: any;
            name: any;
            phone: any;
            role: any;
        };
    }>;
    me(userId: string): Promise<{
        name: string;
        email: string;
        phone: string | null;
        role: import("@prisma/client").$Enums.Role;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateProfile(userId: string, data: {
        name: string;
        phone?: string;
    }): Promise<{
        name: string;
        email: string;
        phone: string | null;
        role: import("@prisma/client").$Enums.Role;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private generateAuthResponse;
}

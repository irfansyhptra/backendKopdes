import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        success: boolean;
        data: {
            accessToken: string;
            refreshToken: any;
            user: {
                id: any;
                email: any;
                name: any;
                phone: any;
                role: any;
            };
        };
    }>;
    login(dto: LoginDto): Promise<{
        success: boolean;
        data: {
            accessToken: string;
            refreshToken: any;
            user: {
                id: any;
                email: any;
                name: any;
                phone: any;
                role: any;
            };
        };
    }>;
    refresh(refreshToken: string): Promise<{
        success: boolean;
        data: {
            accessToken: string;
            refreshToken: any;
            user: {
                id: any;
                email: any;
                name: any;
                phone: any;
                role: any;
            };
        };
    }>;
    me(req: any): Promise<{
        success: boolean;
        data: {
            name: string;
            email: string;
            phone: string | null;
            role: import("@prisma/client").$Enums.Role;
            id: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    updateProfile(req: any, name: string, phone?: string): Promise<{
        success: boolean;
        data: {
            name: string;
            email: string;
            phone: string | null;
            role: import("@prisma/client").$Enums.Role;
            id: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
}

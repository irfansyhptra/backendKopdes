import { PrismaService } from '../../database/prisma.service';
export declare class SeedService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    seed(): Promise<{
        message: string;
        usersCount: number;
        categoriesCount: number;
        productsCount: number;
        umkmProductsCount: number;
        info: string;
        accounts: {
            email: string;
            role: "SUPER_ADMIN" | "ADMIN_KOPDES" | "CUSTOMER" | "UMKM" | "COURIER";
        }[];
    }>;
}

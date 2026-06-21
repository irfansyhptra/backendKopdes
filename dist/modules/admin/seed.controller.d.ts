import { SeedService } from './seed.service';
export declare class SeedController {
    private readonly seedService;
    constructor(seedService: SeedService);
    seed(): Promise<{
        message: string;
        usersCount: number;
        categoriesCount: number;
        productsCount: number;
        info: string;
        accounts: {
            email: string;
            role: "SUPER_ADMIN" | "ADMIN_KOPDES" | "CUSTOMER" | "UMKM" | "COURIER";
        }[];
        success: boolean;
    }>;
}

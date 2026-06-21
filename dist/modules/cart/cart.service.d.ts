import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
export declare class CartService {
    private readonly prisma;
    private readonly cache;
    private readonly cartCachePrefix;
    private readonly cacheTtl;
    constructor(prisma: PrismaService, cache: CacheService);
    private getCacheKey;
    getOrCreateCart(userId: string): Promise<{
        items: ({
            product: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
            }) | null;
            umkmProduct: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                umkmId: string;
                isApproved: boolean;
                rejectionReason: string | null;
            }) | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string | null;
            umkmProductId: string | null;
            quantity: number;
            cartId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    getCart(userId: string): Promise<any>;
    addItem(userId: string, dto: AddToCartDto): Promise<{
        items: ({
            product: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
            }) | null;
            umkmProduct: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                umkmId: string;
                isApproved: boolean;
                rejectionReason: string | null;
            }) | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string | null;
            umkmProductId: string | null;
            quantity: number;
            cartId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    updateItem(userId: string, dto: UpdateCartItemDto): Promise<{
        items: ({
            product: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
            }) | null;
            umkmProduct: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                umkmId: string;
                isApproved: boolean;
                rejectionReason: string | null;
            }) | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string | null;
            umkmProductId: string | null;
            quantity: number;
            cartId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    removeItem(userId: string, productId?: string, umkmProductId?: string): Promise<{
        items: ({
            product: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
            }) | null;
            umkmProduct: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                umkmId: string;
                isApproved: boolean;
                rejectionReason: string | null;
            }) | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string | null;
            umkmProductId: string | null;
            quantity: number;
            cartId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    clearCart(userId: string): Promise<{
        items: ({
            product: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
            }) | null;
            umkmProduct: ({
                images: {
                    url: string;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: import("@prisma/client/runtime/library").Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                umkmId: string;
                isApproved: boolean;
                rejectionReason: string | null;
            }) | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string | null;
            umkmProductId: string | null;
            quantity: number;
            cartId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
}

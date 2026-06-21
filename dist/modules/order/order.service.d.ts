import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, Prisma } from '@prisma/client';
export declare class OrderService {
    private readonly prisma;
    private readonly cache;
    private readonly historyCachePrefix;
    private readonly detailCachePrefix;
    private readonly cacheTtl;
    constructor(prisma: PrismaService, cache: CacheService);
    private getHistoryCacheKey;
    private getDetailCacheKey;
    checkout(userId: string, dto: CheckoutDto): Promise<{
        items: ({
            product: ({
                images: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                    url: string;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: Prisma.Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
            }) | null;
            umkmProduct: ({
                images: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                    url: string;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: Prisma.Decimal;
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
            price: Prisma.Decimal;
            productId: string | null;
            umkmProductId: string | null;
            quantity: number;
            orderId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deliveryAddressId: string;
        paymentMethod: import("@prisma/client").$Enums.PaymentMethod;
        totalAmount: Prisma.Decimal;
        status: import("@prisma/client").$Enums.OrderStatus;
        paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
        customerId: string;
    }>;
    createDirectOrder(userId: string, dto: CreateOrderDto): Promise<{
        items: ({
            product: ({
                images: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                    url: string;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: Prisma.Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
            }) | null;
            umkmProduct: ({
                images: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    isPrimary: boolean;
                    productId: string | null;
                    umkmProductId: string | null;
                    url: string;
                }[];
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                description: string;
                price: Prisma.Decimal;
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
            price: Prisma.Decimal;
            productId: string | null;
            umkmProductId: string | null;
            quantity: number;
            orderId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deliveryAddressId: string;
        paymentMethod: import("@prisma/client").$Enums.PaymentMethod;
        totalAmount: Prisma.Decimal;
        status: import("@prisma/client").$Enums.OrderStatus;
        paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
        customerId: string;
    }>;
    getOrderHistory(userId: string): Promise<any[]>;
    getOrderDetail(userId: string, orderId: string, role: string): Promise<any>;
    updateStatus(userId: string, orderId: string, status: OrderStatus): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            price: Prisma.Decimal;
            productId: string | null;
            umkmProductId: string | null;
            quantity: number;
            orderId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deliveryAddressId: string;
        paymentMethod: import("@prisma/client").$Enums.PaymentMethod;
        totalAmount: Prisma.Decimal;
        status: import("@prisma/client").$Enums.OrderStatus;
        paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
        customerId: string;
    }>;
    getTimeline(orderId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        action: string;
        details: string | null;
        ipAddress: string | null;
    }[]>;
}

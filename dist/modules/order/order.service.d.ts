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
                price: Prisma.Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                isPreOrderAllowed: boolean;
                preOrderAvailableAt: Date | null;
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
                price: Prisma.Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                isPreOrderAllowed: boolean;
                preOrderAvailableAt: Date | null;
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
                price: Prisma.Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                isPreOrderAllowed: boolean;
                preOrderAvailableAt: Date | null;
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
                price: Prisma.Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                isPreOrderAllowed: boolean;
                preOrderAvailableAt: Date | null;
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
    listAllForAdmin(status?: OrderStatus): Promise<({
        payment: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.PaymentStatus;
            orderId: string;
            method: import("@prisma/client").$Enums.PaymentMethod;
            amount: Prisma.Decimal;
            transactionId: string | null;
            qrisCode: string | null;
            paidAt: Date | null;
        } | null;
        delivery: ({
            courier: {
                name: string;
                phone: string | null;
                id: string;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.DeliveryStatus;
            orderId: string;
            courierId: string | null;
            courierMarkedDeliveredAt: Date | null;
            customerConfirmedAt: Date | null;
            estimatedDeliveryTime: Date | null;
            actualDeliveryTime: Date | null;
        }) | null;
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
                price: Prisma.Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                isPreOrderAllowed: boolean;
                preOrderAvailableAt: Date | null;
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
                price: Prisma.Decimal;
                stock: number;
                categoryId: string;
                isActive: boolean;
                isPreOrderAllowed: boolean;
                preOrderAvailableAt: Date | null;
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
        customer: {
            name: string;
            email: string;
            phone: string | null;
            id: string;
        };
        deliveryAddress: {
            phone: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            title: string;
            recipientName: string;
            street: string;
            city: string;
            state: string;
            postalCode: string;
            isDefault: boolean;
        };
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
    })[]>;
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
    confirmCustomerDelivery(userId: string, orderId: string): Promise<{
        payment: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.PaymentStatus;
            orderId: string;
            method: import("@prisma/client").$Enums.PaymentMethod;
            amount: Prisma.Decimal;
            transactionId: string | null;
            qrisCode: string | null;
            paidAt: Date | null;
        } | null;
        delivery: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.DeliveryStatus;
            orderId: string;
            courierId: string | null;
            courierMarkedDeliveredAt: Date | null;
            customerConfirmedAt: Date | null;
            estimatedDeliveryTime: Date | null;
            actualDeliveryTime: Date | null;
        } | null;
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
}

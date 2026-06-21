import { OrderService } from './order.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
export declare class OrderController {
    private readonly orderService;
    constructor(orderService: OrderService);
    checkout(req: any, dto: CheckoutDto): Promise<{
        success: boolean;
        message: string;
        order: {
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
                    price: import("@prisma/client/runtime/library").Decimal;
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
                price: import("@prisma/client/runtime/library").Decimal;
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
            totalAmount: import("@prisma/client/runtime/library").Decimal;
            status: import("@prisma/client").$Enums.OrderStatus;
            paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
            customerId: string;
        };
    }>;
    createDirectOrder(req: any, dto: CreateOrderDto): Promise<{
        success: boolean;
        message: string;
        order: {
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
                    price: import("@prisma/client/runtime/library").Decimal;
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
                price: import("@prisma/client/runtime/library").Decimal;
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
            totalAmount: import("@prisma/client/runtime/library").Decimal;
            status: import("@prisma/client").$Enums.OrderStatus;
            paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
            customerId: string;
        };
    }>;
    getOrderHistory(req: any): Promise<{
        success: boolean;
        orders: any[];
    }>;
    getOrderDetail(req: any, orderId: string): Promise<{
        success: boolean;
        order: any;
    }>;
    updateStatus(req: any, orderId: string, dto: UpdateOrderStatusDto): Promise<{
        success: boolean;
        message: string;
        order: {
            items: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                price: import("@prisma/client/runtime/library").Decimal;
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
            totalAmount: import("@prisma/client/runtime/library").Decimal;
            status: import("@prisma/client").$Enums.OrderStatus;
            paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
            customerId: string;
        };
    }>;
    getInvoice(req: any, orderId: string): Promise<{
        success: boolean;
        invoice: any;
    }>;
    getTimeline(req: any, orderId: string): Promise<{
        success: boolean;
        timeline: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            action: string;
            details: string | null;
            ipAddress: string | null;
        }[];
    }>;
}

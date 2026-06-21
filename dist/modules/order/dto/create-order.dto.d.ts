import { PaymentMethod } from '@prisma/client';
export declare class CreateOrderItemDto {
    productId?: string;
    umkmProductId?: string;
    quantity: number;
}
export declare class CreateOrderDto {
    items: CreateOrderItemDto[];
    deliveryAddressId: string;
    paymentMethod: PaymentMethod;
}

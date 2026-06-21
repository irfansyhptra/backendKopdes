import { PaymentMethod } from '@prisma/client';
export declare class CheckoutDto {
    deliveryAddressId: string;
    paymentMethod: PaymentMethod;
}

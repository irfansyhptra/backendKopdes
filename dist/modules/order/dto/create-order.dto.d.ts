import { PaymentMethod } from '@prisma/client';
import { DeliveryAddressSelectionDto } from './delivery-address-selection.dto';
export declare class CreateOrderItemDto {
    productId?: string;
    umkmProductId?: string;
    quantity: number;
}
export declare class CreateOrderDto extends DeliveryAddressSelectionDto {
    items: CreateOrderItemDto[];
    paymentMethod: PaymentMethod;
}

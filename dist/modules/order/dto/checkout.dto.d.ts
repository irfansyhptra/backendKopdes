import { PaymentMethod } from '@prisma/client';
import { DeliveryAddressSelectionDto } from './delivery-address-selection.dto';
export declare class CheckoutDto extends DeliveryAddressSelectionDto {
    paymentMethod: PaymentMethod;
}

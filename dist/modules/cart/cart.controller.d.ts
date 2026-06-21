import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
export declare class CartController {
    private readonly cartService;
    constructor(cartService: CartService);
    getCart(req: any): Promise<{
        success: boolean;
        cart: any;
    }>;
    addItem(req: any, dto: AddToCartDto): Promise<{
        success: boolean;
        message: string;
        cart: {
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
        };
    }>;
    updateItem(req: any, dto: UpdateCartItemDto): Promise<{
        success: boolean;
        message: string;
        cart: {
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
        };
    }>;
    removeItem(req: any, productId?: string, umkmProductId?: string): Promise<{
        success: boolean;
        message: string;
        cart: {
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
        };
    }>;
    clearCart(req: any): Promise<{
        success: boolean;
        message: string;
        cart: {
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
        };
    }>;
}

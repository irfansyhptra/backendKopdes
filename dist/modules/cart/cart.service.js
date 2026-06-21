"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const cache_service_1 = require("../../cache/cache.service");
let CartService = class CartService {
    prisma;
    cache;
    cartCachePrefix = 'cart:active:';
    cacheTtl = 3600;
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
    }
    getCacheKey(userId) {
        return `${this.cartCachePrefix}${userId}`;
    }
    async getOrCreateCart(userId) {
        let cart = await this.prisma.cart.findUnique({
            where: { userId },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                images: true,
                            },
                        },
                        umkmProduct: {
                            include: {
                                images: true,
                            },
                        },
                    },
                },
            },
        });
        if (!cart) {
            cart = await this.prisma.cart.create({
                data: { userId },
                include: {
                    items: {
                        include: {
                            product: {
                                include: {
                                    images: true,
                                },
                            },
                            umkmProduct: {
                                include: {
                                    images: true,
                                },
                            },
                        },
                    },
                },
            });
        }
        return cart;
    }
    async getCart(userId) {
        const cacheKey = this.getCacheKey(userId);
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const cart = await this.getOrCreateCart(userId);
        await this.cache.set(cacheKey, cart, this.cacheTtl);
        return cart;
    }
    async addItem(userId, dto) {
        const { productId, umkmProductId, quantity } = dto;
        if (!productId && !umkmProductId) {
            throw new common_1.BadRequestException('Either productId or umkmProductId must be provided');
        }
        const cart = await this.getOrCreateCart(userId);
        if (productId) {
            const product = await this.prisma.product.findUnique({
                where: { id: productId },
            });
            if (!product || !product.isActive) {
                throw new common_1.NotFoundException('Product not found or inactive');
            }
            if (product.stock < quantity) {
                throw new common_1.BadRequestException(`Insufficient stock. Available: ${product.stock}`);
            }
            const existing = await this.prisma.cartItem.findUnique({
                where: {
                    cartId_productId: {
                        cartId: cart.id,
                        productId,
                    },
                },
            });
            if (existing) {
                const newQty = existing.quantity + quantity;
                if (product.stock < newQty) {
                    throw new common_1.BadRequestException(`Insufficient stock. Total requested: ${newQty}, Available: ${product.stock}`);
                }
                await this.prisma.cartItem.update({
                    where: { id: existing.id },
                    data: { quantity: newQty },
                });
            }
            else {
                await this.prisma.cartItem.create({
                    data: {
                        cartId: cart.id,
                        productId,
                        quantity,
                    },
                });
            }
        }
        else if (umkmProductId) {
            const umkmProduct = await this.prisma.uMKMProduct.findUnique({
                where: { id: umkmProductId },
            });
            if (!umkmProduct || !umkmProduct.isActive || !umkmProduct.isApproved) {
                throw new common_1.NotFoundException('UMKM Product not found or inactive');
            }
            if (umkmProduct.stock < quantity) {
                throw new common_1.BadRequestException(`Insufficient stock. Available: ${umkmProduct.stock}`);
            }
            const existing = await this.prisma.cartItem.findUnique({
                where: {
                    cartId_umkmProductId: {
                        cartId: cart.id,
                        umkmProductId,
                    },
                },
            });
            if (existing) {
                const newQty = existing.quantity + quantity;
                if (umkmProduct.stock < newQty) {
                    throw new common_1.BadRequestException(`Insufficient stock. Total requested: ${newQty}, Available: ${umkmProduct.stock}`);
                }
                await this.prisma.cartItem.update({
                    where: { id: existing.id },
                    data: { quantity: newQty },
                });
            }
            else {
                await this.prisma.cartItem.create({
                    data: {
                        cartId: cart.id,
                        umkmProductId,
                        quantity,
                    },
                });
            }
        }
        await this.cache.delete(this.getCacheKey(userId));
        return this.getOrCreateCart(userId);
    }
    async updateItem(userId, dto) {
        const { productId, umkmProductId, quantity } = dto;
        if (!productId && !umkmProductId) {
            throw new common_1.BadRequestException('Either productId or umkmProductId must be provided');
        }
        const cart = await this.getOrCreateCart(userId);
        if (productId) {
            const product = await this.prisma.product.findUnique({
                where: { id: productId },
            });
            if (!product || !product.isActive) {
                throw new common_1.NotFoundException('Product not found or inactive');
            }
            if (product.stock < quantity) {
                throw new common_1.BadRequestException(`Insufficient stock. Available: ${product.stock}`);
            }
            const existing = await this.prisma.cartItem.findUnique({
                where: {
                    cartId_productId: {
                        cartId: cart.id,
                        productId,
                    },
                },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Item not found in cart');
            }
            await this.prisma.cartItem.update({
                where: { id: existing.id },
                data: { quantity },
            });
        }
        else if (umkmProductId) {
            const umkmProduct = await this.prisma.uMKMProduct.findUnique({
                where: { id: umkmProductId },
            });
            if (!umkmProduct || !umkmProduct.isActive || !umkmProduct.isApproved) {
                throw new common_1.NotFoundException('UMKM Product not found or inactive');
            }
            if (umkmProduct.stock < quantity) {
                throw new common_1.BadRequestException(`Insufficient stock. Available: ${umkmProduct.stock}`);
            }
            const existing = await this.prisma.cartItem.findUnique({
                where: {
                    cartId_umkmProductId: {
                        cartId: cart.id,
                        umkmProductId,
                    },
                },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Item not found in cart');
            }
            await this.prisma.cartItem.update({
                where: { id: existing.id },
                data: { quantity },
            });
        }
        await this.cache.delete(this.getCacheKey(userId));
        return this.getOrCreateCart(userId);
    }
    async removeItem(userId, productId, umkmProductId) {
        if (!productId && !umkmProductId) {
            throw new common_1.BadRequestException('Either productId or umkmProductId must be provided');
        }
        const cart = await this.getOrCreateCart(userId);
        if (productId) {
            const existing = await this.prisma.cartItem.findUnique({
                where: {
                    cartId_productId: {
                        cartId: cart.id,
                        productId,
                    },
                },
            });
            if (existing) {
                await this.prisma.cartItem.delete({ where: { id: existing.id } });
            }
        }
        else if (umkmProductId) {
            const existing = await this.prisma.cartItem.findUnique({
                where: {
                    cartId_umkmProductId: {
                        cartId: cart.id,
                        umkmProductId,
                    },
                },
            });
            if (existing) {
                await this.prisma.cartItem.delete({ where: { id: existing.id } });
            }
        }
        await this.cache.delete(this.getCacheKey(userId));
        return this.getOrCreateCart(userId);
    }
    async clearCart(userId) {
        const cart = await this.getOrCreateCart(userId);
        await this.prisma.cartItem.deleteMany({
            where: { cartId: cart.id },
        });
        await this.cache.delete(this.getCacheKey(userId));
        return this.getOrCreateCart(userId);
    }
};
exports.CartService = CartService;
exports.CartService = CartService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], CartService);
//# sourceMappingURL=cart.service.js.map
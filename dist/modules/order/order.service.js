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
exports.OrderService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const cache_service_1 = require("../../cache/cache.service");
const client_1 = require("@prisma/client");
let OrderService = class OrderService {
    prisma;
    cache;
    historyCachePrefix = 'orders:history:';
    detailCachePrefix = 'order:detail:';
    cacheTtl = 3600;
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
    }
    getHistoryCacheKey(userId) {
        return `${this.historyCachePrefix}${userId}`;
    }
    getDetailCacheKey(orderId) {
        return `${this.detailCachePrefix}${orderId}`;
    }
    async checkout(userId, dto) {
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
            include: {
                items: {
                    include: {
                        product: true,
                        umkmProduct: true,
                    },
                },
            },
        });
        if (!cart || cart.items.length === 0) {
            throw new common_1.BadRequestException('Shopping cart is empty');
        }
        let address = await this.prisma.address.findUnique({
            where: { id: dto.deliveryAddressId },
        });
        if (!address && dto.deliveryAddressId === 'default-mock-address-id') {
            address = await this.prisma.address.create({
                data: {
                    id: 'default-mock-address-id',
                    userId,
                    title: 'Rumah Utama',
                    recipientName: 'Budi Santoso',
                    phone: '081234567890',
                    street: 'Jl. Merdeka No. 10',
                    city: 'Sleman',
                    state: 'DI Yogyakarta',
                    postalCode: '55281',
                    isDefault: true,
                },
            });
        }
        if (!address) {
            throw new common_1.NotFoundException('Delivery address not found');
        }
        const order = await this.prisma.$transaction(async (tx) => {
            let totalAmount = new client_1.Prisma.Decimal(0);
            const orderItemsData = [];
            for (const item of cart.items) {
                if (item.productId) {
                    const product = await tx.product.findUnique({
                        where: { id: item.productId },
                    });
                    if (!product || !product.isActive) {
                        throw new common_1.BadRequestException(`Product "${product?.name || item.productId}" is not available`);
                    }
                    if (product.stock < item.quantity) {
                        throw new common_1.BadRequestException(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
                    }
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: product.stock - item.quantity },
                    });
                    await tx.inventoryTransaction.create({
                        data: {
                            productId: item.productId,
                            type: 'OUT',
                            quantity: item.quantity,
                            reason: `Checkout Order`,
                        },
                    });
                    const itemTotal = new client_1.Prisma.Decimal(product.price).mul(item.quantity);
                    totalAmount = totalAmount.add(itemTotal);
                    orderItemsData.push({
                        productId: item.productId,
                        quantity: item.quantity,
                        price: product.price,
                    });
                }
                else if (item.umkmProductId) {
                    const umkmProduct = await tx.uMKMProduct.findUnique({
                        where: { id: item.umkmProductId },
                    });
                    if (!umkmProduct || !umkmProduct.isActive || !umkmProduct.isApproved) {
                        throw new common_1.BadRequestException(`UMKM Product "${umkmProduct?.name || item.umkmProductId}" is not available`);
                    }
                    if (umkmProduct.stock < item.quantity) {
                        throw new common_1.BadRequestException(`Insufficient stock for "${umkmProduct.name}". Available: ${umkmProduct.stock}`);
                    }
                    await tx.uMKMProduct.update({
                        where: { id: item.umkmProductId },
                        data: { stock: umkmProduct.stock - item.quantity },
                    });
                    const itemTotal = new client_1.Prisma.Decimal(umkmProduct.price).mul(item.quantity);
                    totalAmount = totalAmount.add(itemTotal);
                    orderItemsData.push({
                        umkmProductId: item.umkmProductId,
                        quantity: item.quantity,
                        price: umkmProduct.price,
                    });
                }
            }
            const newOrder = await tx.order.create({
                data: {
                    customerId: userId,
                    totalAmount,
                    status: 'PENDING',
                    paymentMethod: dto.paymentMethod,
                    paymentStatus: 'PENDING',
                    deliveryAddressId: dto.deliveryAddressId,
                    items: {
                        create: orderItemsData,
                    },
                },
                include: {
                    items: {
                        include: {
                            product: {
                                include: { images: true },
                            },
                            umkmProduct: {
                                include: { images: true },
                            },
                        },
                    },
                },
            });
            const mockQrisCode = dto.paymentMethod === 'QRIS' ? 'mock-qris-data-string' : null;
            await tx.payment.create({
                data: {
                    orderId: newOrder.id,
                    method: dto.paymentMethod,
                    status: 'PENDING',
                    amount: totalAmount,
                    qrisCode: mockQrisCode,
                },
            });
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
            const invoiceNumber = `INV/${dateStr}/${uniqueSuffix}`;
            await tx.invoice.create({
                data: {
                    orderId: newOrder.id,
                    invoiceNumber,
                },
            });
            await tx.cartItem.deleteMany({
                where: { cartId: cart.id },
            });
            return newOrder;
        });
        await this.cache.delete(`cart:active:${userId}`);
        await this.cache.delete(this.getHistoryCacheKey(userId));
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'ORDER_CREATED',
                details: `User created order ${order.id} via checkout with status PENDING`,
            },
        });
        return order;
    }
    async createDirectOrder(userId, dto) {
        if (dto.items.length === 0) {
            throw new common_1.BadRequestException('Order items list is empty');
        }
        let address = await this.prisma.address.findUnique({
            where: { id: dto.deliveryAddressId },
        });
        if (!address && dto.deliveryAddressId === 'default-mock-address-id') {
            address = await this.prisma.address.create({
                data: {
                    id: 'default-mock-address-id',
                    userId,
                    title: 'Rumah Utama',
                    recipientName: 'Budi Santoso',
                    phone: '081234567890',
                    street: 'Jl. Merdeka No. 10',
                    city: 'Sleman',
                    state: 'DI Yogyakarta',
                    postalCode: '55281',
                    isDefault: true,
                },
            });
        }
        if (!address) {
            throw new common_1.NotFoundException('Delivery address not found');
        }
        const order = await this.prisma.$transaction(async (tx) => {
            let totalAmount = new client_1.Prisma.Decimal(0);
            const orderItemsData = [];
            for (const item of dto.items) {
                if (item.productId) {
                    const product = await tx.product.findUnique({
                        where: { id: item.productId },
                    });
                    if (!product || !product.isActive) {
                        throw new common_1.BadRequestException(`Product is not available`);
                    }
                    if (product.stock < item.quantity) {
                        throw new common_1.BadRequestException(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
                    }
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: product.stock - item.quantity },
                    });
                    await tx.inventoryTransaction.create({
                        data: {
                            productId: item.productId,
                            type: 'OUT',
                            quantity: item.quantity,
                            reason: `Direct Order`,
                        },
                    });
                    const itemTotal = new client_1.Prisma.Decimal(product.price).mul(item.quantity);
                    totalAmount = totalAmount.add(itemTotal);
                    orderItemsData.push({
                        productId: item.productId,
                        quantity: item.quantity,
                        price: product.price,
                    });
                }
                else if (item.umkmProductId) {
                    const umkmProduct = await tx.uMKMProduct.findUnique({
                        where: { id: item.umkmProductId },
                    });
                    if (!umkmProduct || !umkmProduct.isActive || !umkmProduct.isApproved) {
                        throw new common_1.BadRequestException(`UMKM Product is not available`);
                    }
                    if (umkmProduct.stock < item.quantity) {
                        throw new common_1.BadRequestException(`Insufficient stock for "${umkmProduct.name}". Available: ${umkmProduct.stock}`);
                    }
                    await tx.uMKMProduct.update({
                        where: { id: item.umkmProductId },
                        data: { stock: umkmProduct.stock - item.quantity },
                    });
                    const itemTotal = new client_1.Prisma.Decimal(umkmProduct.price).mul(item.quantity);
                    totalAmount = totalAmount.add(itemTotal);
                    orderItemsData.push({
                        umkmProductId: item.umkmProductId,
                        quantity: item.quantity,
                        price: umkmProduct.price,
                    });
                }
                else {
                    throw new common_1.BadRequestException('Either productId or umkmProductId must be provided for order items');
                }
            }
            const newOrder = await tx.order.create({
                data: {
                    customerId: userId,
                    totalAmount,
                    status: 'PENDING',
                    paymentMethod: dto.paymentMethod,
                    paymentStatus: 'PENDING',
                    deliveryAddressId: dto.deliveryAddressId,
                    items: {
                        create: orderItemsData,
                    },
                },
                include: {
                    items: {
                        include: {
                            product: {
                                include: { images: true },
                            },
                            umkmProduct: {
                                include: { images: true },
                            },
                        },
                    },
                },
            });
            const mockQrisCode = dto.paymentMethod === 'QRIS' ? 'mock-qris-data-string' : null;
            await tx.payment.create({
                data: {
                    orderId: newOrder.id,
                    method: dto.paymentMethod,
                    status: 'PENDING',
                    amount: totalAmount,
                    qrisCode: mockQrisCode,
                },
            });
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
            const invoiceNumber = `INV/${dateStr}/${uniqueSuffix}`;
            await tx.invoice.create({
                data: {
                    orderId: newOrder.id,
                    invoiceNumber,
                },
            });
            return newOrder;
        });
        await this.cache.delete(this.getHistoryCacheKey(userId));
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'ORDER_CREATED',
                details: `User created direct order ${order.id} with status PENDING`,
            },
        });
        return order;
    }
    async getOrderHistory(userId) {
        const cacheKey = this.getHistoryCacheKey(userId);
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const orders = await this.prisma.order.findMany({
            where: { customerId: userId },
            include: {
                items: {
                    include: {
                        product: { include: { images: true } },
                        umkmProduct: { include: { images: true } },
                    },
                },
                invoice: true,
                payment: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        await this.cache.set(cacheKey, orders, this.cacheTtl);
        return orders;
    }
    async getOrderDetail(userId, orderId, role) {
        const cacheKey = this.getDetailCacheKey(orderId);
        const cached = await this.cache.get(cacheKey);
        let order = cached;
        if (!order) {
            order = await this.prisma.order.findUnique({
                where: { id: orderId },
                include: {
                    items: {
                        include: {
                            product: { include: { images: true } },
                            umkmProduct: { include: { images: true } },
                        },
                    },
                    payment: true,
                    invoice: true,
                    delivery: true,
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                        },
                    },
                    deliveryAddress: true,
                },
            });
            if (!order) {
                throw new common_1.NotFoundException('Order not found');
            }
            await this.cache.set(cacheKey, order, this.cacheTtl);
        }
        if (role !== 'SUPER_ADMIN' && role !== 'ADMIN_KOPDES' && role !== 'COURIER' && order.customerId !== userId) {
            throw new common_1.ForbiddenException('You do not have permission to view this order');
        }
        return order;
    }
    async updateStatus(userId, orderId, status) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        const oldStatus = order.status;
        if (oldStatus === status) {
            return order;
        }
        const updatedOrder = await this.prisma.$transaction(async (tx) => {
            let paymentStatusUpdate;
            let paidAtUpdate;
            if (status === 'PAID') {
                paymentStatusUpdate = 'PAID';
                paidAtUpdate = new Date();
            }
            const updated = await tx.order.update({
                where: { id: orderId },
                data: {
                    status,
                    ...(paymentStatusUpdate ? { paymentStatus: paymentStatusUpdate } : {}),
                },
                include: {
                    items: {
                        include: {
                            product: { include: { images: true } },
                            umkmProduct: { include: { images: true } },
                        },
                    },
                    payment: true,
                    invoice: true,
                    delivery: true,
                },
            });
            if (paymentStatusUpdate) {
                await tx.payment.update({
                    where: { orderId },
                    data: {
                        status: paymentStatusUpdate,
                        paidAt: paidAtUpdate,
                    },
                });
            }
            if (status === 'CANCELLED' && oldStatus !== 'CANCELLED') {
                for (const item of order.items) {
                    if (item.productId) {
                        await tx.product.update({
                            where: { id: item.productId },
                            data: { stock: { increment: item.quantity } },
                        });
                        await tx.inventoryTransaction.create({
                            data: {
                                productId: item.productId,
                                type: 'IN',
                                quantity: item.quantity,
                                reason: `Order #${orderId} Cancelled (Stock Restored)`,
                            },
                        });
                    }
                    else if (item.umkmProductId) {
                        await tx.uMKMProduct.update({
                            where: { id: item.umkmProductId },
                            data: { stock: { increment: item.quantity } },
                        });
                    }
                }
            }
            return updated;
        });
        await this.cache.delete(this.getDetailCacheKey(orderId));
        await this.cache.delete(this.getHistoryCacheKey(order.customerId));
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'ORDER_STATUS_UPDATED',
                details: `Updated order ${orderId} status from ${oldStatus} to ${status}`,
            },
        });
        return updatedOrder;
    }
    async getTimeline(orderId) {
        const logs = await this.prisma.auditLog.findMany({
            where: {
                details: {
                    contains: orderId,
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        return logs;
    }
};
exports.OrderService = OrderService;
exports.OrderService = OrderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], OrderService);
//# sourceMappingURL=order.service.js.map
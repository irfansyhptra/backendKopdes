import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

@Injectable()
export class OrderService {
  private readonly historyCachePrefix = 'orders:history:';
  private readonly detailCachePrefix = 'order:detail:';
  private readonly cacheTtl = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private getHistoryCacheKey(userId: string): string {
    return `${this.historyCachePrefix}${userId}`;
  }

  private getDetailCacheKey(orderId: string): string {
    return `${this.detailCachePrefix}${orderId}`;
  }

  async checkout(userId: string, dto: CheckoutDto) {
    // 1. Get active cart
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
      throw new BadRequestException('Shopping cart is empty');
    }

    // Validate delivery address exists
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
      throw new NotFoundException('Delivery address not found');
    }

    // 2. Perform Stock Reservation and Order Creation inside transaction
    const order = await this.prisma.$transaction(async (tx) => {
      let totalAmount = new Prisma.Decimal(0);
      const orderItemsData = [];

      for (const item of cart.items) {
        if (item.productId) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product || !product.isActive) {
            throw new BadRequestException(`Product "${product?.name || item.productId}" is not available`);
          }

          if (product.stock < item.quantity) {
            throw new BadRequestException(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
          }

          // Decrement stock
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: product.stock - item.quantity },
          });

          // Log inventory transaction
          await tx.inventoryTransaction.create({
            data: {
              productId: item.productId,
              type: 'OUT',
              quantity: item.quantity,
              reason: `Checkout Order`,
            },
          });

          const itemTotal = new Prisma.Decimal(product.price).mul(item.quantity);
          totalAmount = totalAmount.add(itemTotal);

          orderItemsData.push({
            productId: item.productId,
            quantity: item.quantity,
            price: product.price,
          });
        } else if (item.umkmProductId) {
          const umkmProduct = await tx.uMKMProduct.findUnique({
            where: { id: item.umkmProductId },
          });

          if (!umkmProduct || !umkmProduct.isActive || !umkmProduct.isApproved) {
            throw new BadRequestException(`UMKM Product "${umkmProduct?.name || item.umkmProductId}" is not available`);
          }

          if (umkmProduct.stock < item.quantity) {
            throw new BadRequestException(`Insufficient stock for "${umkmProduct.name}". Available: ${umkmProduct.stock}`);
          }

          // Decrement stock
          await tx.uMKMProduct.update({
            where: { id: item.umkmProductId },
            data: { stock: umkmProduct.stock - item.quantity },
          });

          const itemTotal = new Prisma.Decimal(umkmProduct.price).mul(item.quantity);
          totalAmount = totalAmount.add(itemTotal);

          orderItemsData.push({
            umkmProductId: item.umkmProductId,
            quantity: item.quantity,
            price: umkmProduct.price,
          });
        }
      }

      // Create Order
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

      // Create Payment
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

      // Generate Invoice
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
      const invoiceNumber = `INV/${dateStr}/${uniqueSuffix}`;

      await tx.invoice.create({
        data: {
          orderId: newOrder.id,
          invoiceNumber,
        },
      });

      // Clear Cart Items
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return newOrder;
    });

    // Invalidate Cart Cache
    await this.cache.delete(`cart:active:${userId}`);
    // Invalidate History Cache
    await this.cache.delete(this.getHistoryCacheKey(userId));

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'ORDER_CREATED',
        details: `User created order ${order.id} via checkout with status PENDING`,
      },
    });

    return order;
  }

  async createDirectOrder(userId: string, dto: CreateOrderDto) {
    if (dto.items.length === 0) {
      throw new BadRequestException('Order items list is empty');
    }

    // Validate delivery address exists
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
      throw new NotFoundException('Delivery address not found');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      let totalAmount = new Prisma.Decimal(0);
      const orderItemsData = [];

      for (const item of dto.items) {
        if (item.productId) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product || !product.isActive) {
            throw new BadRequestException(`Product is not available`);
          }

          if (product.stock < item.quantity) {
            throw new BadRequestException(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
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

          const itemTotal = new Prisma.Decimal(product.price).mul(item.quantity);
          totalAmount = totalAmount.add(itemTotal);

          orderItemsData.push({
            productId: item.productId,
            quantity: item.quantity,
            price: product.price,
          });
        } else if (item.umkmProductId) {
          const umkmProduct = await tx.uMKMProduct.findUnique({
            where: { id: item.umkmProductId },
          });

          if (!umkmProduct || !umkmProduct.isActive || !umkmProduct.isApproved) {
            throw new BadRequestException(`UMKM Product is not available`);
          }

          if (umkmProduct.stock < item.quantity) {
            throw new BadRequestException(`Insufficient stock for "${umkmProduct.name}". Available: ${umkmProduct.stock}`);
          }

          await tx.uMKMProduct.update({
            where: { id: item.umkmProductId },
            data: { stock: umkmProduct.stock - item.quantity },
          });

          const itemTotal = new Prisma.Decimal(umkmProduct.price).mul(item.quantity);
          totalAmount = totalAmount.add(itemTotal);

          orderItemsData.push({
            umkmProductId: item.umkmProductId,
            quantity: item.quantity,
            price: umkmProduct.price,
          });
        } else {
          throw new BadRequestException('Either productId or umkmProductId must be provided for order items');
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

      // Create Payment
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

      // Generate Invoice
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

  async getOrderHistory(userId: string) {
    const cacheKey = this.getHistoryCacheKey(userId);
    const cached = await this.cache.get<any[]>(cacheKey);
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

  async getOrderDetail(userId: string, orderId: string, role: string) {
    const cacheKey = this.getDetailCacheKey(orderId);
    const cached = await this.cache.get<any>(cacheKey);

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
        throw new NotFoundException('Order not found');
      }

      await this.cache.set(cacheKey, order, this.cacheTtl);
    }

    // Authorization check
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN_KOPDES' && role !== 'COURIER' && order.customerId !== userId) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    return order;
  }

  async updateStatus(userId: string, orderId: string, status: OrderStatus) {
    // 1. Get current order details
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const oldStatus = order.status;
    if (oldStatus === status) {
      return order;
    }

    // 2. Perform updates inside transaction
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // Determine payment status updates
      let paymentStatusUpdate: PaymentStatus | undefined;
      let paidAtUpdate: Date | null | undefined;

      if (status === 'PAID') {
        paymentStatusUpdate = 'PAID';
        paidAtUpdate = new Date();
      }

      // Update Order
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

      // Update Payment if status is PAID
      if (paymentStatusUpdate) {
        await tx.payment.update({
          where: { orderId },
          data: {
            status: paymentStatusUpdate,
            paidAt: paidAtUpdate,
          },
        });
      }

      // If CANCELLED, restore product stocks
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
          } else if (item.umkmProductId) {
            await tx.uMKMProduct.update({
              where: { id: item.umkmProductId },
              data: { stock: { increment: item.quantity } },
            });
          }
        }
      }

      return updated;
    });

    // Invalidate Caches
    await this.cache.delete(this.getDetailCacheKey(orderId));
    await this.cache.delete(this.getHistoryCacheKey(order.customerId));

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'ORDER_STATUS_UPDATED',
        details: `Updated order ${orderId} status from ${oldStatus} to ${status}`,
      },
    });

    return updatedOrder;
  }

  async getTimeline(orderId: string) {
    // Return audit logs that match this order ID in their details
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
}

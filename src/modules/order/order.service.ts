import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { AddressService } from '../address/address.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { ALLOWED_ORDER_TRANSITIONS, canTransition } from './order-transitions';
import {
  composeOrderTotals,
  resolveDiscount,
  resolveShippingFee,
} from './order-money';

@Injectable()
export class OrderService {
  private readonly historyCachePrefix = 'orders:history:';
  private readonly detailCachePrefix = 'order:detail:';
  private readonly cacheTtl = 3600; // 1 hour

  // Peran yang boleh menggerakkan status pesanan milik siapa pun.
  private static readonly STAFF_ROLES: string[] = [
    'SUPER_ADMIN',
    'ADMIN_KOPDES',
    'PEGAWAI_KOPDES',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly addressService: AddressService,
  ) {}

  /// Kunci riwayat kini memuat halaman: satu kunci untuk seluruh riwayat
  /// berarti halaman 2 menimpa halaman 1 di cache yang sama.
  private getHistoryCacheKey(userId: string, page: number, limit: number) {
    return `${this.historyCachePrefix}${userId}:p${page}:l${limit}`;
  }

  /// Seluruh halaman riwayat satu pemesan sekaligus.
  ///
  /// Dipakai setiap kali riwayatnya berubah — pesanan baru, status bergerak,
  /// penerimaan dikonfirmasi. Membuang satu kunci saja akan menyisakan
  /// halaman lain yang masih memuat pesanan dengan status lama.
  private async invalidateHistory(userId: string): Promise<void> {
    await this.cache.deletePattern(`${this.historyCachePrefix}${userId}:*`);
    // Kunci lama (tanpa nomor halaman) dari versi sebelum paginasi.
    await this.cache.delete(`${this.historyCachePrefix}${userId}`);
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

    // Pemesan boleh mencentang sebagian keranjang. Tanpa daftar ini seluruh
    // keranjang ikut dipesan, seperti perilaku sebelumnya.
    const selectedIds = dto.cartItemIds ? new Set(dto.cartItemIds) : null;
    const checkoutItems = selectedIds
      ? cart.items.filter((item) => selectedIds.has(item.id))
      : cart.items;

    if (checkoutItems.length === 0) {
      throw new BadRequestException('Tidak ada produk keranjang yang dipilih');
    }

    // Alamat utama profil, alamat tersimpan pilihan pemesan, atau alamat baru
    // yang diketik saat checkout — semuanya diputuskan di satu tempat.
    const address = await this.addressService.resolveForOrder(userId, dto);

    // 2. Perform Stock Reservation and Order Creation inside transaction
    const order = await this.prisma.$transaction(async (tx) => {
      let totalAmount = new Prisma.Decimal(0);
      const orderItemsData = [];

      for (const item of checkoutItems) {
        if (item.productId) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product || !product.isActive) {
            throw new BadRequestException(
              `Product "${product?.name || item.productId}" is not available`,
            );
          }

          if (product.stock < item.quantity) {
            if (!product.isPreOrderAllowed) {
              throw new BadRequestException(
                `Stok "${product.name}" tidak mencukupi (${product.stock} tersisa) dan produk tidak membuka pre-order`,
              );
            }
          }

          // Decrement stock down to 0 minimum
          const newStock = Math.max(0, product.stock - item.quantity);
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: newStock },
          });

          // Log inventory transaction
          await tx.inventoryTransaction.create({
            data: {
              productId: item.productId,
              type: 'OUT',
              quantity: item.quantity,
              stockAfter: newStock,
              reason:
                product.stock < item.quantity
                  ? `Pre-Order Checkout`
                  : `Checkout Order`,
            },
          });

          const itemTotal = new Prisma.Decimal(product.price).mul(
            item.quantity,
          );
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

          if (
            !umkmProduct ||
            !umkmProduct.isActive ||
            !umkmProduct.isApproved
          ) {
            throw new BadRequestException(
              `UMKM Product "${umkmProduct?.name || item.umkmProductId}" is not available`,
            );
          }

          if (umkmProduct.stock < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for "${umkmProduct.name}". Available: ${umkmProduct.stock}`,
            );
          }

          // Decrement stock
          const umkmNewStock = umkmProduct.stock - item.quantity;
          await tx.uMKMProduct.update({
            where: { id: item.umkmProductId },
            data: { stock: umkmNewStock },
          });

          await tx.inventoryTransaction.create({
            data: {
              umkmProductId: item.umkmProductId,
              type: 'OUT',
              quantity: item.quantity,
              stockAfter: umkmNewStock,
              reason: 'Checkout Order',
            },
          });

          const itemTotal = new Prisma.Decimal(umkmProduct.price).mul(
            item.quantity,
          );
          totalAmount = totalAmount.add(itemTotal);

          orderItemsData.push({
            umkmProductId: item.umkmProductId,
            quantity: item.quantity,
            price: umkmProduct.price,
          });
        }
      }

      // Komponen uang disusun lewat satu rumus bersama, bukan dihitung
      // sendiri per jalur pembuatan pesanan.
      const totals = composeOrderTotals(totalAmount, {
        shippingFee: resolveShippingFee(),
        discountAmount: resolveDiscount(),
      });

      // Create Order
      const newOrder = await tx.order.create({
        data: {
          customerId: userId,
          subtotal: totals.subtotal,
          shippingFee: totals.shippingFee,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          status: 'PENDING',
          paymentMethod: dto.paymentMethod,
          paymentStatus: 'PENDING',
          deliveryAddressId: address.id,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                  kopdes: { select: { id: true, name: true } },
                },
              },
              umkmProduct: {
                include: {
                  images: true,
                  umkm: {
                    select: { id: true, businessName: true, status: true },
                  },
                },
              },
            },
          },
        },
      });

      // Create Payment
      const mockQrisCode =
        dto.paymentMethod === 'QRIS' ? 'mock-qris-data-string' : null;
      await tx.payment.create({
        data: {
          orderId: newOrder.id,
          method: dto.paymentMethod,
          status: 'PENDING',
          // Yang ditagihkan total akhir, bukan nilai barangnya: pembayaran
          // yang memakai subtotal akan selalu kurang bayar begitu ongkir
          // mulai dibebankan.
          amount: totals.totalAmount,
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

      // Hanya item yang benar-benar dipesan yang dikeluarkan dari keranjang;
      // sisanya tetap menunggu di sana untuk pesanan berikutnya.
      await tx.cartItem.deleteMany({
        where: { id: { in: checkoutItems.map((item) => item.id) } },
      });

      return newOrder;
    });

    // Invalidate Cart Cache
    await this.cache.delete(`cart:active:${userId}`);
    // Invalidate History Cache
    await this.invalidateHistory(userId);

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

    // Alamat utama profil, alamat tersimpan pilihan pemesan, atau alamat baru
    // yang diketik saat checkout — semuanya diputuskan di satu tempat.
    const address = await this.addressService.resolveForOrder(userId, dto);

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
            throw new BadRequestException(
              `Insufficient stock for "${product.name}". Available: ${product.stock}`,
            );
          }

          const productNewStock = product.stock - item.quantity;
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: productNewStock },
          });

          await tx.inventoryTransaction.create({
            data: {
              productId: item.productId,
              type: 'OUT',
              quantity: item.quantity,
              stockAfter: productNewStock,
              reason: `Direct Order`,
            },
          });

          const itemTotal = new Prisma.Decimal(product.price).mul(
            item.quantity,
          );
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

          if (
            !umkmProduct ||
            !umkmProduct.isActive ||
            !umkmProduct.isApproved
          ) {
            throw new BadRequestException(`UMKM Product is not available`);
          }

          if (umkmProduct.stock < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for "${umkmProduct.name}". Available: ${umkmProduct.stock}`,
            );
          }

          const umkmNewStock = umkmProduct.stock - item.quantity;
          await tx.uMKMProduct.update({
            where: { id: item.umkmProductId },
            data: { stock: umkmNewStock },
          });

          await tx.inventoryTransaction.create({
            data: {
              umkmProductId: item.umkmProductId,
              type: 'OUT',
              quantity: item.quantity,
              stockAfter: umkmNewStock,
              reason: 'Direct Order',
            },
          });

          const itemTotal = new Prisma.Decimal(umkmProduct.price).mul(
            item.quantity,
          );
          totalAmount = totalAmount.add(itemTotal);

          orderItemsData.push({
            umkmProductId: item.umkmProductId,
            quantity: item.quantity,
            price: umkmProduct.price,
          });
        } else {
          throw new BadRequestException(
            'Either productId or umkmProductId must be provided for order items',
          );
        }
      }

      // Komponen uang disusun lewat satu rumus bersama, bukan dihitung
      // sendiri per jalur pembuatan pesanan.
      const totals = composeOrderTotals(totalAmount, {
        shippingFee: resolveShippingFee(),
        discountAmount: resolveDiscount(),
      });

      const newOrder = await tx.order.create({
        data: {
          customerId: userId,
          subtotal: totals.subtotal,
          shippingFee: totals.shippingFee,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          status: 'PENDING',
          paymentMethod: dto.paymentMethod,
          paymentStatus: 'PENDING',
          deliveryAddressId: address.id,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                  kopdes: { select: { id: true, name: true } },
                },
              },
              umkmProduct: {
                include: {
                  images: true,
                  umkm: {
                    select: { id: true, businessName: true, status: true },
                  },
                },
              },
            },
          },
        },
      });

      // Create Payment
      const mockQrisCode =
        dto.paymentMethod === 'QRIS' ? 'mock-qris-data-string' : null;
      await tx.payment.create({
        data: {
          orderId: newOrder.id,
          method: dto.paymentMethod,
          status: 'PENDING',
          // Yang ditagihkan total akhir, bukan nilai barangnya: pembayaran
          // yang memakai subtotal akan selalu kurang bayar begitu ongkir
          // mulai dibebankan.
          amount: totals.totalAmount,
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

    await this.invalidateHistory(userId);

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'ORDER_CREATED',
        details: `User created direct order ${order.id} with status PENDING`,
      },
    });

    return order;
  }

  /**
   * Riwayat pesanan satu pemesan, berhalaman.
   *
   * Sebelumnya seluruh riwayat dikirim sekali jalan dan di-cache utuh; pada
   * akun yang sudah lama berbelanja itu berarti satu respons yang terus
   * tumbuh dan tidak pernah dipakai seluruhnya oleh layar mana pun.
   */
  async getOrderHistory(userId: string, page = 1, limit = 10) {
    const take = Math.min(Math.max(limit, 1), 50);
    const current = Math.max(page, 1);
    const skip = (current - 1) * take;

    const cacheKey = this.getHistoryCacheKey(userId, current, take);
    const cached = await this.cache.get<{ orders: any[]; meta: any }>(cacheKey);
    if (cached) {
      return cached;
    }

    const total = await this.prisma.order.count({
      where: { customerId: userId },
    });

    const orders = await this.prisma.order.findMany({
      skip,
      take,
      where: { customerId: userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
                kopdes: { select: { id: true, name: true } },
              },
            },
            umkmProduct: {
              include: {
                images: true,
                umkm: {
                  select: { id: true, businessName: true, status: true },
                },
              },
            },
          },
        },
        invoice: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const payload = {
      orders,
      meta: {
        total,
        page: current,
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };

    await this.cache.set(cacheKey, payload, this.cacheTtl);
    return payload;
  }

  // Admin Kopdes: seluruh pesanan koperasi, opsional difilter status.
  /**
   * Filter kepemilikan Kopdes untuk sebuah pesanan.
   *
   * `Order` tidak menyimpan kopdesId sendiri, jadi ditelusuri lewat barisnya:
   * produk Kopdes langsung, atau produk mitra yang bernaung di Kopdes itu.
   * `null` (Super Admin) berarti tanpa penyaringan.
   */
  static kopdesScope(kopdesId: string | null): Prisma.OrderWhereInput {
    if (!kopdesId) return {};
    return {
      items: {
        some: {
          OR: [
            { product: { kopdesId } },
            { umkmProduct: { umkm: { kopdesId } } },
          ],
        },
      },
    };
  }

  async listAllForAdmin(
    status: OrderStatus | undefined,
    kopdesId: string | null,
    page = 1,
    limit = 20,
  ) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.OrderWhereInput = {
      ...OrderService.kopdesScope(kopdesId),
      ...(status ? { status } : {}),
    };

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                  kopdes: { select: { id: true, name: true } },
                },
              },
              umkmProduct: {
                include: {
                  images: true,
                  umkm: {
                    select: { id: true, businessName: true, status: true },
                  },
                },
              },
            },
          },
          payment: true,
          delivery: {
            include: {
              courier: { select: { id: true, name: true, phone: true } },
            },
          },
          customer: {
            select: { id: true, name: true, email: true, phone: true },
          },
          deliveryAddress: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders,
      meta: {
        total,
        page: Math.max(page, 1),
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  async getOrderDetail(
    userId: string,
    orderId: string,
    role: string,
    kopdesId: string | null = null,
  ) {
    const cacheKey = this.getDetailCacheKey(orderId);
    const cached = await this.cache.get<any>(cacheKey);

    let order = cached;
    if (!order) {
      order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                  kopdes: { select: { id: true, name: true } },
                },
              },
              umkmProduct: {
                include: {
                  images: true,
                  umkm: {
                    select: { id: true, businessName: true, status: true },
                  },
                },
              },
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
    if (
      !OrderService.STAFF_ROLES.includes(role) &&
      role !== 'COURIER' &&
      order.customerId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    // Staf desa tidak boleh membuka pesanan Kopdes lain. Dicek terhadap
    // database dan bukan terhadap objek cache, supaya baris yang sudah
    // tersimpan di Redis tidak menjadi celah baca lintas desa.
    if (OrderService.STAFF_ROLES.includes(role) && kopdesId) {
      const owned = await this.prisma.order.findFirst({
        where: { id: orderId, ...OrderService.kopdesScope(kopdesId) },
        select: { id: true },
      });
      if (!owned) {
        throw new ForbiddenException(
          'Pesanan ini bukan milik Kopdes tempat Anda bertugas',
        );
      }
    }

    return order;
  }

  async updateStatus(
    userId: string,
    orderId: string,
    status: OrderStatus,
    role: string,
    /** Kopdes penugasan staf. `null` = Super Admin, tanpa batas desa. */
    kopdesId: string | null = null,
  ) {
    // 1. Get current order details
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // 2. Authorization: hanya staf Kopdes yang boleh menggerakkan status pesanan.
    // Non-staf paling jauh hanya boleh membatalkan pesanannya sendiri yang belum diproses.
    if (!OrderService.STAFF_ROLES.includes(role)) {
      if (order.customerId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to modify this order',
        );
      }
      if (status !== 'CANCELLED' || order.status !== 'PENDING') {
        throw new ForbiddenException(
          'You may only cancel your own order while it is still pending',
        );
      }
    }

    // 2b. Staf desa hanya boleh menyentuh pesanan Kopdes tempatnya bertugas.
    // Dicek dengan query terpisah agar filter kepemilikan tetap dievaluasi
    // database, bukan disimpulkan dari relasi yang kebetulan ikut ter-include.
    if (OrderService.STAFF_ROLES.includes(role) && kopdesId) {
      const owned = await this.prisma.order.findFirst({
        where: { id: orderId, ...OrderService.kopdesScope(kopdesId) },
        select: { id: true },
      });
      if (!owned) {
        throw new ForbiddenException(
          'Pesanan ini bukan milik Kopdes tempat Anda bertugas',
        );
      }
    }

    const oldStatus = order.status;
    if (oldStatus === status) {
      return order;
    }

    // 2c. Status tidak boleh melompat. Pelanggan yang membatalkan pesanannya
    // sendiri sudah dibatasi di atas, jadi peta ini berlaku untuk semua.
    if (!canTransition(oldStatus, status)) {
      const allowed = ALLOWED_ORDER_TRANSITIONS[oldStatus];
      throw new BadRequestException(
        allowed.length === 0
          ? `Pesanan berstatus ${oldStatus} sudah final dan tidak bisa diubah`
          : `Status ${oldStatus} hanya bisa berpindah ke: ${allowed.join(', ')}`,
      );
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
          ...(paymentStatusUpdate
            ? { paymentStatus: paymentStatusUpdate }
            : {}),
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                  kopdes: { select: { id: true, name: true } },
                },
              },
              umkmProduct: {
                include: {
                  images: true,
                  umkm: {
                    select: { id: true, businessName: true, status: true },
                  },
                },
              },
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
            const restoredProduct = await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
            await tx.inventoryTransaction.create({
              data: {
                productId: item.productId,
                type: 'IN',
                quantity: item.quantity,
                stockAfter: restoredProduct.stock,
                reason: `Order #${orderId} Cancelled (Stock Restored)`,
              },
            });
          } else if (item.umkmProductId) {
            const restored = await tx.uMKMProduct.update({
              where: { id: item.umkmProductId },
              data: { stock: { increment: item.quantity } },
            });
            await tx.inventoryTransaction.create({
              data: {
                umkmProductId: item.umkmProductId,
                type: 'IN',
                quantity: item.quantity,
                stockAfter: restored.stock,
                reason: `Order #${orderId} Cancelled (Stock Restored)`,
              },
            });
          }
        }
      }

      return updated;
    });

    // Invalidate Caches
    await this.cache.delete(this.getDetailCacheKey(orderId));
    await this.invalidateHistory(order.customerId);

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

  async getTimeline(userId: string, orderId: string, role: string) {
    // Pakai ulang pemeriksaan akses milik getOrderDetail — timeline mengungkap
    // isi pesanan, jadi syarat bacanya harus sama persis.
    await this.getOrderDetail(userId, orderId, role);

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

  // Dual Validation Step 2: Customer confirms "[Barang Sudah Diterima]"
  async confirmCustomerDelivery(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true },
    });

    if (!order) {
      throw new NotFoundException('Order tidak ditemukan');
    }

    if (order.customerId !== userId) {
      throw new ForbiddenException('Pesanan ini bukan milik Anda');
    }

    const now = new Date();
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // 1. Update delivery status if delivery record exists
      if (order.delivery) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: 'COMPLETED',
            customerConfirmedAt: now,
          },
        });
      }

      // 2. Update Order status to COMPLETED
      const ord = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          paymentStatus:
            order.paymentMethod === 'COD' ? 'PAID' : order.paymentStatus,
        },
        include: {
          items: true,
          payment: true,
          delivery: true,
        },
      });

      // Update Payment if COD
      if (order.paymentMethod === 'COD') {
        await tx.payment.updateMany({
          where: { orderId },
          data: { status: 'PAID', paidAt: now },
        });
      }

      // Audit Log for Complete Dual Validation Trail
      await tx.auditLog.create({
        data: {
          userId,
          action: 'DUAL_VALIDATION_CUSTOMER_CONFIRMED',
          details: `Customer mengonfirmasi penerimaan barang untuk Order #${orderId}. Transaksi pengiriman SELESAI.`,
        },
      });

      return ord;
    });

    // Invalidate Caches
    await this.cache.delete(this.getDetailCacheKey(orderId));
    await this.invalidateHistory(userId);

    return updatedOrder;
  }
}

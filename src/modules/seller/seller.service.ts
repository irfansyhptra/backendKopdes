import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { StorageService } from '../../storage/storage.service';
import { CreateSellerProductDto } from './dto/create-seller-product.dto';
import { UpdateSellerProductDto } from './dto/update-seller-product.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class SellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
  ) {}

  // Helpers to get UMKM profile by user ID
  async getUmkmByUserId(userId: string) {
    const umkm = await this.prisma.uMKM.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!umkm) {
      throw new NotFoundException('UMKM profile not found for this user');
    }
    return umkm;
  }

  // Dashboard Stats with Caching
  async getDashboard(userId: string) {
    const umkm = await this.getUmkmByUserId(userId);
    const cacheKey = `cache:seller:dashboard:${umkm.id}`;

    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // 1. Total Products
    const totalProducts = await this.prisma.uMKMProduct.count({
      where: { umkmId: umkm.id, isActive: true },
    });

    // 2. Total Orders (orders containing seller's products)
    const totalOrders = await this.prisma.order.count({
      where: { items: { some: { umkmProduct: { umkmId: umkm.id } } } },
    });

    // 3. Products Sold (sum of quantity of completed order items)
    const productsSoldResult = await this.prisma.orderItem.aggregate({
      where: {
        umkmProduct: { umkmId: umkm.id },
        order: { status: { in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] } },
      },
      _sum: { quantity: true },
    });
    const productsSold = productsSoldResult._sum.quantity || 0;

    // 4. Earnings (Today vs Month)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayEarningsResult = await this.prisma.orderItem.findMany({
      where: {
        umkmProduct: { umkmId: umkm.id },
        order: {
          status: { in: [OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
          createdAt: { gte: startOfToday },
        },
      },
      select: { quantity: true, price: true },
    });
    const todayEarnings = todayEarningsResult.reduce(
      (sum, item) => sum + item.quantity * Number(item.price),
      0,
    );

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyEarningsResult = await this.prisma.orderItem.findMany({
      where: {
        umkmProduct: { umkmId: umkm.id },
        order: {
          status: { in: [OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
          createdAt: { gte: startOfMonth },
        },
      },
      select: { quantity: true, price: true },
    });
    const monthlyEarnings = monthlyEarningsResult.reduce(
      (sum, item) => sum + item.quantity * Number(item.price),
      0,
    );

    // 5. Store Rating
    const ratingResult = await this.prisma.review.aggregate({
      where: { umkmProduct: { umkmId: umkm.id } },
      _avg: { rating: true },
    });
    const storeRating = ratingResult._avg.rating ? Number(ratingResult._avg.rating.toFixed(1)) : 0.0;

    // 6. Low stock products (stock <= 5)
    const lowStockCount = await this.prisma.uMKMProduct.count({
      where: { umkmId: umkm.id, stock: { lte: 5 }, isActive: true },
    });

    const lowStockProducts = await this.prisma.uMKMProduct.findMany({
      where: { umkmId: umkm.id, stock: { lte: 5 }, isActive: true },
      include: { category: true },
      take: 5,
    });

    // 7. New Order Notifications (Pending / Processing)
    const newOrdersCount = await this.prisma.order.count({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
      },
    });

    // 8. Recent Activities (combining recent order items, reviews)
    const [recentOrderItems, recentReviews] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { umkmProduct: { umkmId: umkm.id } },
        include: { order: { select: { customer: { select: { name: true } }, createdAt: true } }, umkmProduct: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.review.findMany({
        where: { umkmProduct: { umkmId: umkm.id } },
        include: { user: { select: { name: true } }, umkmProduct: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const activities = [];
    for (const item of recentOrderItems) {
      activities.push({
        type: 'ORDER',
        title: 'Pesanan Baru Masuk',
        description: `${item.order.customer.name} membeli ${item.quantity}x ${item.umkmProduct?.name}`,
        timestamp: item.order.createdAt,
      });
    }

    for (const r of recentReviews) {
      activities.push({
        type: 'REVIEW',
        title: 'Ulasan Produk Baru',
        description: `${r.user.name} memberikan bintang ${r.rating} untuk ${r.umkmProduct?.name}`,
        timestamp: r.createdAt,
      });
    }

    for (const prod of lowStockProducts) {
      activities.push({
        type: 'STOCK_WARN',
        title: 'Stok Hampir Habis',
        description: `Stok produk ${prod.name} tersisa ${prod.stock} unit`,
        timestamp: prod.updatedAt,
      });
    }

    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const result = {
      storeInfo: {
        id: umkm.id,
        businessName: umkm.businessName,
        description: umkm.description,
        address: umkm.address,
        phone: umkm.phone,
        status: umkm.status,
        verifiedAt: umkm.verifiedAt,
      },
      stats: {
        totalProducts,
        totalOrders,
        productsSold,
        todayEarnings,
        monthlyEarnings,
        storeRating,
        lowStockCount,
        newOrdersCount,
      },
      lowStockProducts: lowStockProducts.map((p) => ({
        ...p,
        price: Number(p.price),
      })),
      recentActivities: activities.slice(0, 8),
    };

    // Cache in Redis for 10 minutes (600 seconds)
    await this.cacheService.set(cacheKey, result, 600);

    return result;
  }

  // Profile Retrieval & Update
  async getProfile(userId: string) {
    return this.getUmkmByUserId(userId);
  }

  async updateProfile(userId: string, dto: UpdateSellerProfileDto) {
    const umkm = await this.getUmkmByUserId(userId);

    const updated = await this.prisma.uMKM.update({
      where: { id: umkm.id },
      data: dto,
    });

    await this.invalidateCache(umkm.id);

    return updated;
  }

  // Product List (with caching)
  async getProducts(userId: string, query: { search?: string; categoryId?: string; page?: number; limit?: number }) {
    const umkm = await this.getUmkmByUserId(userId);
    const { search, categoryId, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const cacheKey = `cache:seller:products:${umkm.id}:${search || ''}:${categoryId || ''}:${page}:${limit}`;
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = { umkmId: umkm.id };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.uMKMProduct.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          images: {
            orderBy: { isPrimary: 'desc' },
          },
          reviews: true,
        },
      }),
      this.prisma.uMKMProduct.count({ where }),
    ]);

    const mappedProducts = products.map((p) => {
      // Calculate rating & sales count
      const avgRating = p.reviews.length > 0
        ? Number((p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length).toFixed(1))
        : 0.0;
      
      return {
        ...p,
        price: Number(p.price),
        rating: avgRating,
      };
    });

    const totalPages = Math.ceil(total / limit);
    const result = {
      products: mappedProducts,
      total,
      page,
      limit,
      totalPages,
    };

    // Cache in Redis for 10 minutes (600 seconds)
    await this.cacheService.set(cacheKey, result, 600);

    return result;
  }

  // Create Product
  async createProduct(userId: string, dto: CreateSellerProductDto, files?: any[]) {
    const umkm = await this.getUmkmByUserId(userId);

    // Verify category
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException(`Category with ID ${dto.categoryId} not found`);
    }

    // Create UMKMProduct
    const product = await this.prisma.uMKMProduct.create({
      data: {
        umkmId: umkm.id,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
        categoryId: dto.categoryId,
        isApproved: false, // UMKM products need validation
        isActive: true,
      },
    });

    // Upload Images to MinIO/Supabase Storage
    if (files && files.length > 0) {
      const imagesData = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectKey = await this.storageService.uploadFile(file, 'products');
        const url = await this.storageService.getPublicUrl(objectKey);
        imagesData.push({
          umkmProductId: product.id,
          url,
          isPrimary: i === 0,
        });
      }

      await this.prisma.productImage.createMany({
        data: imagesData,
      });
    }

    await this.invalidateCache(umkm.id);

    return this.prisma.uMKMProduct.findUnique({
      where: { id: product.id },
      include: {
        category: true,
        images: true,
      },
    });
  }

  // Update Product
  async updateProduct(userId: string, productId: string, dto: UpdateSellerProductDto, files?: any[]) {
    const umkm = await this.getUmkmByUserId(userId);

    const product = await this.prisma.uMKMProduct.findFirst({
      where: { id: productId, umkmId: umkm.id },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found under your store`);
    }

    // Check category if changing
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException(`Category with ID ${dto.categoryId} not found`);
      }
    }

    // Upload and add new images
    if (files && files.length > 0) {
      const primaryImageExists = await this.prisma.productImage.findFirst({
        where: { umkmProductId: productId, isPrimary: true },
      });

      const imagesData = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectKey = await this.storageService.uploadFile(file, 'products');
        const url = await this.storageService.getPublicUrl(objectKey);
        imagesData.push({
          umkmProductId: productId,
          url,
          isPrimary: !primaryImageExists && i === 0,
        });
      }

      await this.prisma.productImage.createMany({
        data: imagesData,
      });
    }

    const updated = await this.prisma.uMKMProduct.update({
      where: { id: productId },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
        categoryId: dto.categoryId,
        isActive: dto.isActive,
      },
      include: {
        category: true,
        images: true,
      },
    });

    await this.invalidateCache(umkm.id);

    return {
      ...updated,
      price: Number(updated.price),
    };
  }

  // Delete/Deactivate Product
  async deleteProduct(userId: string, productId: string) {
    const umkm = await this.getUmkmByUserId(userId);

    const product = await this.prisma.uMKMProduct.findFirst({
      where: { id: productId, umkmId: umkm.id },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found under your store`);
    }

    // Hard delete or deactivate
    // The prompt says "deactivasi/soft delete". Let's update isActive to false.
    await this.prisma.uMKMProduct.update({
      where: { id: productId },
      data: { isActive: false },
    });

    await this.invalidateCache(umkm.id);
  }

  // Get Orders containing seller's products
  async getOrders(userId: string) {
    const umkm = await this.getUmkmByUserId(userId);

    // Get orders containing this seller's products
    const orders = await this.prisma.order.findMany({
      where: {
        items: {
          some: { umkmProduct: { umkmId: umkm.id } },
        },
      },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        items: {
          where: { umkmProduct: { umkmId: umkm.id } },
          include: { umkmProduct: { include: { images: true } } },
        },
        deliveryAddress: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => ({
      ...o,
      totalAmount: Number(o.totalAmount),
      items: o.items.map((i) => ({
        ...i,
        price: Number(i.price),
      })),
    }));
  }

  // Get Single Order Detail
  async getOrderDetail(userId: string, orderId: string) {
    const umkm = await this.getUmkmByUserId(userId);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
      },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        items: {
          where: { umkmProduct: { umkmId: umkm.id } },
          include: { umkmProduct: { include: { images: true } } },
        },
        deliveryAddress: true,
        delivery: { include: { courier: { select: { name: true, phone: true } } } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found or doesn't belong to your products`);
    }

    return {
      ...order,
      totalAmount: Number(order.totalAmount),
      items: order.items.map((i) => ({
        ...i,
        price: Number(i.price),
      })),
    };
  }

  // Update order status (for workflow integration)
  async updateOrderStatus(userId: string, orderId: string, status: OrderStatus) {
    const umkm = await this.getUmkmByUserId(userId);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found or doesn't belong to your store`);
    }

    // Update order status in DB
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    await this.invalidateCache(umkm.id);

    return updated;
  }

  // Get Sales Statistics for charts
  async getStatistics(userId: string) {
    const umkm = await this.getUmkmByUserId(userId);
    const cacheKey = `cache:seller:stats:${umkm.id}`;

    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Gather last 7 days of sales
    const statistics = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const items = await this.prisma.orderItem.findMany({
        where: {
          umkmProduct: { umkmId: umkm.id },
          order: {
            status: { in: [OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
            createdAt: { gte: date, lt: nextDay },
          },
        },
        select: { quantity: true, price: true },
      });

      const totalRevenue = items.reduce((sum, item) => sum + item.quantity * Number(item.price), 0);
      const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

      // format day name (e.g. Sen, Sel, Rab, Kam, Jum, Sab, Min)
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const dayName = dayNames[date.getDay()];

      statistics.push({
        date: date.toISOString().split('T')[0],
        day: dayName,
        revenue: totalRevenue,
        unitsSold: totalUnits,
      });
    }

    // Cache for 30 minutes (1800 seconds)
    await this.cacheService.set(cacheKey, statistics, 1800);

    return statistics;
  }

  // Helper to invalidate cache
  private async invalidateCache(umkmId: string) {
    await this.cacheService.delete(`cache:seller:dashboard:${umkmId}`);
    await this.cacheService.delete(`cache:seller:stats:${umkmId}`);
    await this.cacheService.deletePattern(`cache:seller:products:${umkmId}:*`);
  }
}

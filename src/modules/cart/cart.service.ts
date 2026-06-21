import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  private readonly cartCachePrefix = 'cart:active:';
  private readonly cacheTtl = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private getCacheKey(userId: string): string {
    return `${this.cartCachePrefix}${userId}`;
  }

  async getOrCreateCart(userId: string) {
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

  async getCart(userId: string) {
    const cacheKey = this.getCacheKey(userId);
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const cart = await this.getOrCreateCart(userId);
    await this.cache.set(cacheKey, cart, this.cacheTtl);
    return cart;
  }

  async addItem(userId: string, dto: AddToCartDto) {
    const { productId, umkmProductId, quantity } = dto;

    if (!productId && !umkmProductId) {
      throw new BadRequestException('Either productId or umkmProductId must be provided');
    }

    const cart = await this.getOrCreateCart(userId);

    if (productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product || !product.isActive) {
        throw new NotFoundException('Product not found or inactive');
      }
      if (product.stock < quantity) {
        throw new BadRequestException(`Insufficient stock. Available: ${product.stock}`);
      }

      // Check if item already exists in cart
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
          throw new BadRequestException(`Insufficient stock. Total requested: ${newQty}, Available: ${product.stock}`);
        }
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: newQty },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId,
            quantity,
          },
        });
      }
    } else if (umkmProductId) {
      const umkmProduct = await this.prisma.uMKMProduct.findUnique({
        where: { id: umkmProductId },
      });
      if (!umkmProduct || !umkmProduct.isActive || !umkmProduct.isApproved) {
        throw new NotFoundException('UMKM Product not found or inactive');
      }
      if (umkmProduct.stock < quantity) {
        throw new BadRequestException(`Insufficient stock. Available: ${umkmProduct.stock}`);
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
          throw new BadRequestException(`Insufficient stock. Total requested: ${newQty}, Available: ${umkmProduct.stock}`);
        }
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: newQty },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            umkmProductId,
            quantity,
          },
        });
      }
    }

    // Invalidate Cache
    await this.cache.delete(this.getCacheKey(userId));
    return this.getOrCreateCart(userId);
  }

  async updateItem(userId: string, dto: UpdateCartItemDto) {
    const { productId, umkmProductId, quantity } = dto;

    if (!productId && !umkmProductId) {
      throw new BadRequestException('Either productId or umkmProductId must be provided');
    }

    const cart = await this.getOrCreateCart(userId);

    if (productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product || !product.isActive) {
        throw new NotFoundException('Product not found or inactive');
      }
      if (product.stock < quantity) {
        throw new BadRequestException(`Insufficient stock. Available: ${product.stock}`);
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
        throw new NotFoundException('Item not found in cart');
      }

      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
    } else if (umkmProductId) {
      const umkmProduct = await this.prisma.uMKMProduct.findUnique({
        where: { id: umkmProductId },
      });
      if (!umkmProduct || !umkmProduct.isActive || !umkmProduct.isApproved) {
        throw new NotFoundException('UMKM Product not found or inactive');
      }
      if (umkmProduct.stock < quantity) {
        throw new BadRequestException(`Insufficient stock. Available: ${umkmProduct.stock}`);
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
        throw new NotFoundException('Item not found in cart');
      }

      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
    }

    // Invalidate Cache
    await this.cache.delete(this.getCacheKey(userId));
    return this.getOrCreateCart(userId);
  }

  async removeItem(userId: string, productId?: string, umkmProductId?: string) {
    if (!productId && !umkmProductId) {
      throw new BadRequestException('Either productId or umkmProductId must be provided');
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
    } else if (umkmProductId) {
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

    // Invalidate Cache
    await this.cache.delete(this.getCacheKey(userId));
    return this.getOrCreateCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    // Invalidate Cache
    await this.cache.delete(this.getCacheKey(userId));
    return this.getOrCreateCart(userId);
  }
}

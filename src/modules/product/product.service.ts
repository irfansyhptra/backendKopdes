import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { StorageService } from '../../storage/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
  ) {}

  async findAll(query: ProductQueryDto) {
    const cacheKey = `cache:products:list:${JSON.stringify(query)}`;

    // Try Redis cache first
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const {
      search,
      categoryId,
      minPrice,
      maxPrice,
      inStock,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
    } = query;

    const skip = (page - 1) * limit;

    // Build filters
    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
    }

    if (inStock === true) {
      where.stock = { gt: 0 };
    } else if (inStock === false) {
      where.stock = 0;
    }

    // Execute queries
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          category: true,
          images: {
            orderBy: { isPrimary: 'desc' },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Map Price Decimal to number
    const mappedProducts = products.map((p) => ({
      ...p,
      price: Number(p.price),
    }));

    const result = {
      products: mappedProducts,
      total,
      page,
      limit,
      totalPages,
    };

    // Cache the list for 5 minutes (300 seconds)
    await this.cacheService.set(cacheKey, result, 300);

    return result;
  }

  async findOne(id: string) {
    const cacheKey = `cache:products:detail:${id}`;

    // Try Redis cache first
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: {
          orderBy: { isPrimary: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const mappedProduct = {
      ...product,
      price: Number(product.price),
    };

    // Cache the detail for 30 minutes (1800 seconds)
    await this.cacheService.set(cacheKey, mappedProduct, 1800);

    return mappedProduct;
  }

  async create(dto: CreateProductDto, files?: any[]) {
    // Verify category
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException(`Category with ID ${dto.categoryId} not found`);
    }

    // Create product
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
        categoryId: dto.categoryId,
        isActive: true,
      },
    });

    // Handle files if uploaded
    if (files && files.length > 0) {
      const imagesData = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectKey = await this.storageService.uploadFile(file, 'products');
        const url = await this.storageService.getPublicUrl(objectKey);
        imagesData.push({
          productId: product.id,
          url,
          isPrimary: i === 0, // Mark first image as primary
        });
      }

      await this.prisma.productImage.createMany({
        data: imagesData,
      });
    }

    // Invalidate product caches
    await this.invalidateCache();

    return this.findOne(product.id);
  }

  async update(id: string, dto: UpdateProductDto, files?: any[]) {
    const existingProduct = await this.findOne(id);

    // Verify category if changed
    if (dto.categoryId && dto.categoryId !== existingProduct.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException(`Category with ID ${dto.categoryId} not found`);
      }
    }

    // Handle files if uploaded
    if (files && files.length > 0) {
      // Check if product already has primary image
      const primaryImageExists = await this.prisma.productImage.findFirst({
        where: { productId: id, isPrimary: true },
      });

      const imagesData = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectKey = await this.storageService.uploadFile(file, 'products');
        const url = await this.storageService.getPublicUrl(objectKey);
        imagesData.push({
          productId: id,
          url,
          isPrimary: !primaryImageExists && i === 0,
        });
      }

      await this.prisma.productImage.createMany({
        data: imagesData,
      });
    }

    // Update product fields
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
        categoryId: dto.categoryId,
        isActive: dto.isActive,
      },
    });

    // Invalidate product caches
    await this.invalidateCache();

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id); // throws NotFoundException if not found

    // Soft delete
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    // Invalidate product caches
    await this.invalidateCache();
  }

  async deleteHard(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { images: true },
    });

    if (!product) return;

    // Delete files from Storage
    for (const image of product.images) {
      try {
        // Extract object key from URL
        // Supabase format: https://[ref].supabase.co/storage/v1/object/public/products/123-abc.jpg
        // Legacy format: http://localhost:9000/kopdes/products/123-abc.jpg
        let objectKey: string | null = null;
        try {
          const urlObj = new URL(image.url);
          const parts = urlObj.pathname.split('/object/public/');
          if (parts.length > 1) {
            objectKey = parts[1];
          }
        } catch {
          // Ignore URL parse error and fallback to string splitting
        }

        if (!objectKey) {
          const legacyParts = image.url.split('/kopdes/');
          if (legacyParts.length > 1) {
            objectKey = legacyParts[1];
          }
        }

        if (objectKey) {
          await this.storageService.deleteFile(objectKey);
        }
      } catch (err) {
        console.error(`Failed to delete file from storage: ${image.url}`, err);
      }
    }

    // Delete from database
    await this.prisma.product.delete({
      where: { id },
    });

    // Invalidate product caches
    await this.invalidateCache();
  }

  async checkStockAvailability(id: string, quantity: number): Promise<boolean> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { stock: true },
    });
    if (!product) return false;
    return product.stock >= quantity;
  }

  async updateStock(id: string, quantity: number): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { stock: true },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const newStock = product.stock + quantity;
    if (newStock < 0) {
      throw new BadRequestException('Stock quantity cannot be negative');
    }

    await this.prisma.product.update({
      where: { id },
      data: { stock: newStock },
    });

    // Invalidate caches
    await this.invalidateCache();
  }

  private async invalidateCache() {
    // Delete individual details and paginated list queries
    await this.cacheService.deletePattern('cache:products:*');
  }
}

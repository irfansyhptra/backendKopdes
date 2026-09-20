import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { StorageService } from '../../storage/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

/** Staf yang melakukan perubahan — sumber kopdesId dan jejak audit. */
export interface ProductActor {
  id: string;
  kopdesId: string | null;
}

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
    let products, total;
    try {
      [products, total] = await Promise.all([
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
    } catch (err: any) {
      if (err?.code === 'P2022') {
        await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isPreOrderAllowed" BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "preOrderAvailableAt" TIMESTAMP(3);
          ALTER TABLE "UMKMProduct" ADD COLUMN IF NOT EXISTS "isPreOrderAllowed" BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE "UMKMProduct" ADD COLUMN IF NOT EXISTS "preOrderAvailableAt" TIMESTAMP(3);
        `);
        [products, total] = await Promise.all([
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
      } else {
        throw err;
      }
    }

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

  /**
   * Menolak harga diskon yang tidak masuk akal.
   *
   * class-validator hanya melihat satu field, jadi perbandingan antar-field
   * dikerjakan di sini — bukan diserahkan ke form Flutter, yang bisa dilewati
   * begitu request dikirim langsung ke API.
   */
  private assertPricing(price?: number, discountPrice?: number) {
    if (discountPrice == null) return;
    if (price == null) {
      throw new BadRequestException(
        'Harga diskon hanya bisa diisi bersama harga normal',
      );
    }
    if (discountPrice >= price) {
      throw new BadRequestException(
        'Harga diskon harus lebih kecil dari harga normal',
      );
    }
  }

  /**
   * Memastikan staf desa hanya menyentuh barang Kopdes tempatnya bertugas.
   * `kopdesId` null berarti Super Admin — memang lintas desa.
   */
  private async assertOwnership(productId: string, kopdesId: string | null) {
    if (!kopdesId) return;
    const owned = await this.prisma.product.findFirst({
      where: { id: productId, kopdesId },
      select: { id: true },
    });
    if (!owned) {
      throw new ForbiddenException(
        'Barang ini bukan milik Kopdes tempat Anda bertugas',
      );
    }
  }

  private async writeAudit(
    actorId: string | undefined,
    action: string,
    details: unknown,
  ) {
    if (!actorId) return;
    // Audit tidak boleh menjatuhkan operasi yang sudah berhasil.
    await this.prisma.auditLog
      .create({
        data: { userId: actorId, action, details: JSON.stringify(details) },
      })
      .catch(() => undefined);
  }

  async create(dto: CreateProductDto, files?: any[], actor?: ProductActor) {
    // Verify category
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException(
        `Category with ID ${dto.categoryId} not found`,
      );
    }

    this.assertPricing(dto.price, dto.discountPrice);

    // Create product
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        discountPrice: dto.discountPrice ?? null,
        stock: dto.stock,
        minStock: dto.minStock ?? 5,
        unit: dto.unit?.trim() || 'pcs',
        sku: dto.sku?.trim() || null,
        categoryId: dto.categoryId,
        // Barang selalu lahir di Kopdes pembuatnya. Tanpa ini produk pegawai
        // tidak akan pernah masuk hitungan dashboard desanya sendiri.
        kopdesId: actor?.kopdesId ?? null,
        isPreOrderAllowed: dto.isPreOrderAllowed ?? false,
        preOrderAvailableAt: dto.preOrderAvailableAt
          ? new Date(dto.preOrderAvailableAt)
          : null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.writeAudit(actor?.id, 'PRODUCT_CREATE', {
      productId: product.id,
      kopdesId: product.kopdesId,
      after: {
        name: product.name,
        price: product.price.toString(),
        stock: product.stock,
      },
    });

    // Handle files if uploaded
    if (files && files.length > 0) {
      const imagesData = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectKey = await this.storageService.uploadFile(
          file,
          'products',
        );
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

    // Gambar yang sudah diunggah klien ke penyimpanan luar. Tidak ada berkas
    // yang melewati server di jalur ini.
    await this.attachImageUrls(product.id, dto.imageUrls, files?.length ?? 0);

    // Invalidate product caches
    await this.invalidateCache();

    return this.findOne(product.id);
  }

  /**
   * Memastikan tepat ada satu gambar utama.
   *
   * Dipanggil setelah penghapusan: kalau yang terhapus kebetulan gambar
   * utamanya, sisanya tidak punya penanda sama sekali dan kartu produk
   * tampil kosong di katalog.
   */
  private async ensurePrimaryImage(productId: string) {
    const primary = await this.prisma.productImage.findFirst({
      where: { productId, isPrimary: true },
      select: { id: true },
    });
    if (primary) return;
    const first = await this.prisma.productImage.findFirst({
      where: { productId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (first) {
      await this.prisma.productImage.update({
        where: { id: first.id },
        data: { isPrimary: true },
      });
    }
  }

  /**
   * Menyimpan URL gambar yang diunggah klien.
   *
   * `offset` menjaga penanda gambar utama tetap satu: kalau sudah ada berkas
   * yang diunggah lewat multipart, yang pertama di antara merekalah yang
   * utama, dan URL-URL ini menyusul di belakangnya.
   */
  private async attachImageUrls(
    productId: string,
    urls: string[] | undefined,
    offset = 0,
  ) {
    if (!urls?.length) return;
    await this.prisma.productImage.createMany({
      data: urls.map((url, i) => ({
        productId,
        url,
        isPrimary: offset === 0 && i === 0,
      })),
    });
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    files?: any[],
    actor?: ProductActor,
  ) {
    const existingProduct = await this.findOne(id);
    await this.assertOwnership(id, actor?.kopdesId ?? null);
    this.assertPricing(
      dto.price ?? Number(existingProduct.price),
      dto.discountPrice,
    );

    // Verify category if changed
    if (dto.categoryId && dto.categoryId !== existingProduct.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException(
          `Category with ID ${dto.categoryId} not found`,
        );
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
        const objectKey = await this.storageService.uploadFile(
          file,
          'products',
        );
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
        discountPrice: dto.discountPrice,
        stock: dto.stock,
        minStock: dto.minStock,
        unit: dto.unit?.trim() || undefined,
        sku: dto.sku?.trim() || undefined,
        categoryId: dto.categoryId,
        isPreOrderAllowed: dto.isPreOrderAllowed,
        preOrderAvailableAt: dto.preOrderAvailableAt
          ? new Date(dto.preOrderAvailableAt)
          : undefined,
        isActive: dto.isActive,
      },
    });

    await this.writeAudit(actor?.id, 'PRODUCT_UPDATE', {
      productId: id,
      before: {
        name: existingProduct.name,
        price: existingProduct.price.toString(),
        stock: existingProduct.stock,
      },
      after: {
        name: updated.name,
        price: updated.price.toString(),
        stock: updated.stock,
      },
    });

    // Invalidate product caches
    // Gambar dari penyimpanan luar. `keepImageUrls` dikirim berarti daftar
    // gambar diganti seluruhnya; tidak dikirim berarti gambar lama dibiarkan.
    // Tanpa pembedaan ini, menyunting harga saja akan menghapus gambarnya.
    if (dto.keepImageUrls !== undefined || dto.imageUrls?.length) {
      if (dto.keepImageUrls !== undefined) {
        await this.prisma.productImage.deleteMany({
          where: { productId: id, url: { notIn: dto.keepImageUrls } },
        });
      }
      const remaining = await this.prisma.productImage.count({
        where: { productId: id },
      });
      await this.attachImageUrls(id, dto.imageUrls, remaining);
      // Barang tanpa gambar utama tampil sebagai kotak kosong di katalog.
      await this.ensurePrimaryImage(id);
    }

    await this.invalidateCache();

    return this.findOne(id);
  }

  async remove(id: string, actor?: ProductActor) {
    await this.findOne(id); // throws NotFoundException if not found
    await this.assertOwnership(id, actor?.kopdesId ?? null);

    // Soft delete
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    await this.writeAudit(actor?.id, 'PRODUCT_DEACTIVATE', { productId: id });

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

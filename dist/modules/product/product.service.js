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
exports.ProductService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const cache_service_1 = require("../../cache/cache.service");
const storage_service_1 = require("../../storage/storage.service");
let ProductService = class ProductService {
    prisma;
    cacheService;
    storageService;
    constructor(prisma, cacheService, storageService) {
        this.prisma = prisma;
        this.cacheService = cacheService;
        this.storageService = storageService;
    }
    async findAll(query) {
        const cacheKey = `cache:products:list:${JSON.stringify(query)}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }
        const { search, categoryId, minPrice, maxPrice, inStock, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', isActive, } = query;
        const skip = (page - 1) * limit;
        const where = {};
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
        }
        else if (inStock === false) {
            where.stock = 0;
        }
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
        await this.cacheService.set(cacheKey, result, 300);
        return result;
    }
    async findOne(id) {
        const cacheKey = `cache:products:detail:${id}`;
        const cached = await this.cacheService.get(cacheKey);
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
            throw new common_1.NotFoundException(`Product with ID ${id} not found`);
        }
        const mappedProduct = {
            ...product,
            price: Number(product.price),
        };
        await this.cacheService.set(cacheKey, mappedProduct, 1800);
        return mappedProduct;
    }
    async create(dto, files) {
        const category = await this.prisma.category.findUnique({
            where: { id: dto.categoryId },
        });
        if (!category) {
            throw new common_1.BadRequestException(`Category with ID ${dto.categoryId} not found`);
        }
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
        if (files && files.length > 0) {
            const imagesData = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const objectKey = await this.storageService.uploadFile(file, 'products');
                const url = await this.storageService.getPublicUrl(objectKey);
                imagesData.push({
                    productId: product.id,
                    url,
                    isPrimary: i === 0,
                });
            }
            await this.prisma.productImage.createMany({
                data: imagesData,
            });
        }
        await this.invalidateCache();
        return this.findOne(product.id);
    }
    async update(id, dto, files) {
        const existingProduct = await this.findOne(id);
        if (dto.categoryId && dto.categoryId !== existingProduct.categoryId) {
            const category = await this.prisma.category.findUnique({
                where: { id: dto.categoryId },
            });
            if (!category) {
                throw new common_1.BadRequestException(`Category with ID ${dto.categoryId} not found`);
            }
        }
        if (files && files.length > 0) {
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
        await this.invalidateCache();
        return this.findOne(id);
    }
    async remove(id) {
        await this.findOne(id);
        await this.prisma.product.update({
            where: { id },
            data: { isActive: false },
        });
        await this.invalidateCache();
    }
    async deleteHard(id) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: { images: true },
        });
        if (!product)
            return;
        for (const image of product.images) {
            try {
                let objectKey = null;
                try {
                    const urlObj = new URL(image.url);
                    const parts = urlObj.pathname.split('/object/public/');
                    if (parts.length > 1) {
                        objectKey = parts[1];
                    }
                }
                catch {
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
            }
            catch (err) {
                console.error(`Failed to delete file from storage: ${image.url}`, err);
            }
        }
        await this.prisma.product.delete({
            where: { id },
        });
        await this.invalidateCache();
    }
    async checkStockAvailability(id, quantity) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            select: { stock: true },
        });
        if (!product)
            return false;
        return product.stock >= quantity;
    }
    async updateStock(id, quantity) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            select: { stock: true },
        });
        if (!product) {
            throw new common_1.NotFoundException(`Product with ID ${id} not found`);
        }
        const newStock = product.stock + quantity;
        if (newStock < 0) {
            throw new common_1.BadRequestException('Stock quantity cannot be negative');
        }
        await this.prisma.product.update({
            where: { id },
            data: { stock: newStock },
        });
        await this.invalidateCache();
    }
    async invalidateCache() {
        await this.cacheService.deletePattern('cache:products:*');
    }
};
exports.ProductService = ProductService;
exports.ProductService = ProductService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService,
        storage_service_1.StorageService])
], ProductService);
//# sourceMappingURL=product.service.js.map
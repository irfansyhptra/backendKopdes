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
exports.CategoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const cache_service_1 = require("../../cache/cache.service");
let CategoryService = class CategoryService {
    prisma;
    cacheService;
    CACHE_KEY_LIST = 'cache:categories:list';
    constructor(prisma, cacheService) {
        this.prisma = prisma;
        this.cacheService = cacheService;
    }
    async findAll() {
        const cached = await this.cacheService.get(this.CACHE_KEY_LIST);
        if (cached) {
            return cached;
        }
        const categories = await this.prisma.category.findMany({
            orderBy: { name: 'asc' },
        });
        await this.cacheService.set(this.CACHE_KEY_LIST, categories, 3600);
        return categories;
    }
    async findOne(id) {
        const category = await this.prisma.category.findUnique({
            where: { id },
        });
        if (!category) {
            throw new common_1.NotFoundException(`Category with ID ${id} not found`);
        }
        return category;
    }
    async create(dto) {
        const existing = await this.prisma.category.findUnique({
            where: { name: dto.name },
        });
        if (existing) {
            throw new common_1.ConflictException(`Category with name "${dto.name}" already exists`);
        }
        const category = await this.prisma.category.create({
            data: {
                name: dto.name,
                description: dto.description,
            },
        });
        await this.invalidateCache();
        return category;
    }
    async update(id, dto) {
        await this.findOne(id);
        if (dto.name) {
            const existing = await this.prisma.category.findFirst({
                where: { name: dto.name, NOT: { id } },
            });
            if (existing) {
                throw new common_1.ConflictException(`Category with name "${dto.name}" already exists`);
            }
        }
        const updated = await this.prisma.category.update({
            where: { id },
            data: {
                name: dto.name,
                description: dto.description,
            },
        });
        await this.invalidateCache();
        return updated;
    }
    async remove(id) {
        await this.findOne(id);
        const productCount = await this.prisma.product.count({
            where: { categoryId: id },
        });
        if (productCount > 0) {
            throw new common_1.ConflictException('Cannot delete category because it contains active products');
        }
        await this.prisma.category.delete({
            where: { id },
        });
        await this.invalidateCache();
    }
    async invalidateCache() {
        await this.cacheService.delete(this.CACHE_KEY_LIST);
    }
};
exports.CategoryService = CategoryService;
exports.CategoryService = CategoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], CategoryService);
//# sourceMappingURL=category.service.js.map
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  private readonly CACHE_KEY_LIST = 'cache:categories:list';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async findAll() {
    // Try to get from Redis cache first
    const cached = await this.cacheService.get<any[]>(this.CACHE_KEY_LIST);
    if (cached) {
      return cached;
    }

    // Otherwise, fetch from database
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    // Cache the list for 1 hour (3600 seconds)
    await this.cacheService.set(this.CACHE_KEY_LIST, categories, 3600);

    return categories;
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Category with name "${dto.name}" already exists`);
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
    });

    // Invalidate categories cache
    await this.invalidateCache();

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id); // throws NotFoundException if not found

    if (dto.name) {
      const existing = await this.prisma.category.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException(`Category with name "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });

    // Invalidate categories cache
    await this.invalidateCache();

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id); // throws NotFoundException if not found

    // Check if category has any products before deleting
    const productCount = await this.prisma.product.count({
      where: { categoryId: id },
    });
    if (productCount > 0) {
      throw new ConflictException('Cannot delete category because it contains active products');
    }

    await this.prisma.category.delete({
      where: { id },
    });

    // Invalidate categories cache
    await this.invalidateCache();
  }

  private async invalidateCache() {
    await this.cacheService.delete(this.CACHE_KEY_LIST);
  }
}

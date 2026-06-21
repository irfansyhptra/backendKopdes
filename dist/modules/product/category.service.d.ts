import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
export declare class CategoryService {
    private readonly prisma;
    private readonly cacheService;
    private readonly CACHE_KEY_LIST;
    constructor(prisma: PrismaService, cacheService: CacheService);
    findAll(): Promise<any[]>;
    findOne(id: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
    }>;
    create(dto: CreateCategoryDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
    }>;
    update(id: string, dto: UpdateCategoryDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
    }>;
    remove(id: string): Promise<void>;
    private invalidateCache;
}

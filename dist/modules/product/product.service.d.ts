import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { StorageService } from '../../storage/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
export declare class ProductService {
    private readonly prisma;
    private readonly cacheService;
    private readonly storageService;
    constructor(prisma: PrismaService, cacheService: CacheService, storageService: StorageService);
    findAll(query: ProductQueryDto): Promise<any>;
    findOne(id: string): Promise<any>;
    create(dto: CreateProductDto, files?: any[]): Promise<any>;
    update(id: string, dto: UpdateProductDto, files?: any[]): Promise<any>;
    remove(id: string): Promise<void>;
    deleteHard(id: string): Promise<void>;
    checkStockAvailability(id: string, quantity: number): Promise<boolean>;
    updateStock(id: string, quantity: number): Promise<void>;
    private invalidateCache;
}

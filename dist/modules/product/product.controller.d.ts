import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
export declare class ProductController {
    private readonly productService;
    constructor(productService: ProductService);
    findAll(query: ProductQueryDto): Promise<{
        success: boolean;
        data: any;
    }>;
    findOne(id: string): Promise<{
        success: boolean;
        data: any;
    }>;
    create(dto: CreateProductDto, files?: any[]): Promise<{
        success: boolean;
        data: any;
    }>;
    update(id: string, dto: UpdateProductDto, files?: any[]): Promise<{
        success: boolean;
        data: any;
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
}

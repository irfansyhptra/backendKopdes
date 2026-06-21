import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
export declare class CategoryController {
    private readonly categoryService;
    constructor(categoryService: CategoryService);
    findAll(): Promise<{
        success: boolean;
        data: any[];
    }>;
    findOne(id: string): Promise<{
        success: boolean;
        data: {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
        };
    }>;
    create(dto: CreateCategoryDto): Promise<{
        success: boolean;
        data: {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
        };
    }>;
    update(id: string, dto: UpdateCategoryDto): Promise<{
        success: boolean;
        data: {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
        };
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
}

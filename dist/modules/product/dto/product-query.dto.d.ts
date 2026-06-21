export declare class ProductQueryDto {
    search?: string;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    isActive?: boolean;
}

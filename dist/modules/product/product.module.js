"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const database_module_1 = require("../../database/database.module");
const cache_module_1 = require("../../cache/cache.module");
const storage_module_1 = require("../../storage/storage.module");
const product_controller_1 = require("./product.controller");
const product_service_1 = require("./product.service");
const category_controller_1 = require("./category.controller");
const category_service_1 = require("./category.service");
let ProductModule = class ProductModule {
};
exports.ProductModule = ProductModule;
exports.ProductModule = ProductModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, cache_module_1.CacheModule, storage_module_1.StorageModule, config_1.ConfigModule],
        controllers: [product_controller_1.ProductController, category_controller_1.CategoryController],
        providers: [product_service_1.ProductService, category_service_1.CategoryService],
        exports: [product_service_1.ProductService, category_service_1.CategoryService],
    })
], ProductModule);
//# sourceMappingURL=product.module.js.map
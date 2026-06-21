"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const env_validation_1 = require("./config/env.validation");
const database_module_1 = require("./database/database.module");
const cache_module_1 = require("./cache/cache.module");
const storage_module_1 = require("./storage/storage.module");
const auth_module_1 = require("./modules/auth/auth.module");
const product_module_1 = require("./modules/product/product.module");
const order_module_1 = require("./modules/order/order.module");
const cart_module_1 = require("./modules/cart/cart.module");
const delivery_module_1 = require("./modules/delivery/delivery.module");
const umkm_module_1 = require("./modules/umkm/umkm.module");
const ai_module_1 = require("./modules/ai/ai.module");
const inventory_module_1 = require("./modules/inventory/inventory.module");
const admin_module_1 = require("./modules/admin/admin.module");
const community_module_1 = require("./modules/community/community.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                validate: env_validation_1.validate,
            }),
            database_module_1.DatabaseModule,
            cache_module_1.CacheModule,
            storage_module_1.StorageModule,
            auth_module_1.AuthModule,
            product_module_1.ProductModule,
            order_module_1.OrderModule,
            cart_module_1.CartModule,
            delivery_module_1.DeliveryModule,
            umkm_module_1.UMKMModule,
            ai_module_1.AIModule,
            inventory_module_1.InventoryModule,
            admin_module_1.AdminModule,
            community_module_1.CommunityModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
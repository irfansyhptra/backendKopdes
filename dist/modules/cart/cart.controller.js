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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartController = void 0;
const common_1 = require("@nestjs/common");
const cart_service_1 = require("./cart.service");
const add_to_cart_dto_1 = require("./dto/add-to-cart.dto");
const update_cart_item_dto_1 = require("./dto/update-cart-item.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let CartController = class CartController {
    cartService;
    constructor(cartService) {
        this.cartService = cartService;
    }
    async getCart(req) {
        const userId = req.user.id;
        const cart = await this.cartService.getCart(userId);
        return { success: true, cart };
    }
    async addItem(req, dto) {
        const userId = req.user.id;
        const cart = await this.cartService.addItem(userId, dto);
        return { success: true, message: 'Item added to cart successfully', cart };
    }
    async updateItem(req, dto) {
        const userId = req.user.id;
        const cart = await this.cartService.updateItem(userId, dto);
        return { success: true, message: 'Cart item updated successfully', cart };
    }
    async removeItem(req, productId, umkmProductId) {
        const userId = req.user.id;
        const cart = await this.cartService.removeItem(userId, productId, umkmProductId);
        return { success: true, message: 'Item removed from cart successfully', cart };
    }
    async clearCart(req) {
        const userId = req.user.id;
        const cart = await this.cartService.clearCart(userId);
        return { success: true, message: 'Cart cleared successfully', cart };
    }
};
exports.CartController = CartController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "getCart", null);
__decorate([
    (0, common_1.Post)('add'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, add_to_cart_dto_1.AddToCartDto]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "addItem", null);
__decorate([
    (0, common_1.Put)('update'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_cart_item_dto_1.UpdateCartItemDto]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Delete)('remove'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('productId')),
    __param(2, (0, common_1.Query)('umkmProductId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "removeItem", null);
__decorate([
    (0, common_1.Delete)('clear'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "clearCart", null);
exports.CartController = CartController = __decorate([
    (0, common_1.Controller)('cart'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [cart_service_1.CartService])
], CartController);
//# sourceMappingURL=cart.controller.js.map
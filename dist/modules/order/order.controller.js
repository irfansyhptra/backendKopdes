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
exports.OrderController = void 0;
const common_1 = require("@nestjs/common");
const order_service_1 = require("./order.service");
const checkout_dto_1 = require("./dto/checkout.dto");
const create_order_dto_1 = require("./dto/create-order.dto");
const update_order_status_dto_1 = require("./dto/update-order-status.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let OrderController = class OrderController {
    orderService;
    constructor(orderService) {
        this.orderService = orderService;
    }
    async checkout(req, dto) {
        const userId = req.user.id;
        const order = await this.orderService.checkout(userId, dto);
        return { success: true, message: 'Checkout successful', order };
    }
    async createDirectOrder(req, dto) {
        const userId = req.user.id;
        const order = await this.orderService.createDirectOrder(userId, dto);
        return { success: true, message: 'Order created successfully', order };
    }
    async getOrderHistory(req) {
        const userId = req.user.id;
        const orders = await this.orderService.getOrderHistory(userId);
        return { success: true, orders };
    }
    async getOrderDetail(req, orderId) {
        const userId = req.user.id;
        const role = req.user.role;
        const order = await this.orderService.getOrderDetail(userId, orderId, role);
        return { success: true, order };
    }
    async updateStatus(req, orderId, dto) {
        const userId = req.user.id;
        const order = await this.orderService.updateStatus(userId, orderId, dto.status);
        return { success: true, message: 'Order status updated successfully', order };
    }
    async getInvoice(req, orderId) {
        const userId = req.user.id;
        const role = req.user.role;
        const order = await this.orderService.getOrderDetail(userId, orderId, role);
        return { success: true, invoice: order.invoice };
    }
    async getTimeline(req, orderId) {
        const timeline = await this.orderService.getTimeline(orderId);
        return { success: true, timeline };
    }
};
exports.OrderController = OrderController;
__decorate([
    (0, common_1.Post)('checkout'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, checkout_dto_1.CheckoutDto]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "checkout", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_order_dto_1.CreateOrderDto]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "createDirectOrder", null);
__decorate([
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getOrderHistory", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getOrderDetail", null);
__decorate([
    (0, common_1.Put)(':id/status'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_order_status_dto_1.UpdateOrderStatusDto]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Get)(':id/invoice'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getInvoice", null);
__decorate([
    (0, common_1.Get)(':id/timeline'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getTimeline", null);
exports.OrderController = OrderController = __decorate([
    (0, common_1.Controller)('orders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [order_service_1.OrderService])
], OrderController);
//# sourceMappingURL=order.controller.js.map
import { Controller, Get, Post, Put, Body, Req, UseGuards, Param, Query } from '@nestjs/common';
import { OrderService } from './order.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('checkout')
  async checkout(@Req() req: any, @Body() dto: CheckoutDto) {
    const userId = req.user.id;
    const order = await this.orderService.checkout(userId, dto);
    return { success: true, message: 'Checkout successful', order };
  }

  @Post()
  async createDirectOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const userId = req.user.id;
    const order = await this.orderService.createDirectOrder(userId, dto);
    return { success: true, message: 'Order created successfully', order };
  }

  @Get('history')
  async getOrderHistory(@Req() req: any) {
    const userId = req.user.id;
    const orders = await this.orderService.getOrderHistory(userId);
    return { success: true, orders };
  }

  @Get(':id')
  async getOrderDetail(@Req() req: any, @Param('id') orderId: string) {
    const userId = req.user.id;
    const role = req.user.role;
    const order = await this.orderService.getOrderDetail(userId, orderId, role);
    return { success: true, order };
  }

  @Put(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const userId = req.user.id;
    const order = await this.orderService.updateStatus(userId, orderId, dto.status);
    return { success: true, message: 'Order status updated successfully', order };
  }

  @Get(':id/invoice')
  async getInvoice(@Req() req: any, @Param('id') orderId: string) {
    const userId = req.user.id;
    const role = req.user.role;
    const order = await this.orderService.getOrderDetail(userId, orderId, role);
    return { success: true, invoice: order.invoice };
  }

  @Get(':id/timeline')
  async getTimeline(@Req() req: any, @Param('id') orderId: string) {
    const timeline = await this.orderService.getTimeline(orderId);
    return { success: true, timeline };
  }
}

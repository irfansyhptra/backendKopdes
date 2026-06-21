import { Controller, Get, Post, Put, Delete, Body, Req, UseGuards, Query } from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@Req() req: any) {
    const userId = req.user.id;
    const cart = await this.cartService.getCart(userId);
    return { success: true, cart };
  }

  @Post('add')
  async addItem(@Req() req: any, @Body() dto: AddToCartDto) {
    const userId = req.user.id;
    const cart = await this.cartService.addItem(userId, dto);
    return { success: true, message: 'Item added to cart successfully', cart };
  }

  @Put('update')
  async updateItem(@Req() req: any, @Body() dto: UpdateCartItemDto) {
    const userId = req.user.id;
    const cart = await this.cartService.updateItem(userId, dto);
    return { success: true, message: 'Cart item updated successfully', cart };
  }

  @Delete('remove')
  async removeItem(
    @Req() req: any,
    @Query('productId') productId?: string,
    @Query('umkmProductId') umkmProductId?: string,
  ) {
    const userId = req.user.id;
    const cart = await this.cartService.removeItem(userId, productId, umkmProductId);
    return { success: true, message: 'Item removed from cart successfully', cart };
  }

  @Delete('clear')
  async clearCart(@Req() req: any) {
    const userId = req.user.id;
    const cart = await this.cartService.clearCart(userId);
    return { success: true, message: 'Cart cleared successfully', cart };
  }
}

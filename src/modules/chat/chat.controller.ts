import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ListConversationsQueryDto,
  StartConversationDto,
  SendMessageDto,
} from './dto/chat.dto';

// Chat tersedia untuk semua peran yang terautentikasi.
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async list(@Req() req: any, @Query() query: ListConversationsQueryDto) {
    const data = await this.chatService.listConversations(
      req.user.id,
      query.channel,
    );
    return { success: true, data };
  }

  @Post('conversations')
  async start(@Req() req: any, @Body() dto: StartConversationDto) {
    const data = await this.chatService.getOrCreate(
      req.user.id,
      dto.recipientId,
      dto.channel,
    );
    return { success: true, data };
  }

  @Post('conversations/product/:productId/seller')
  async startProductSeller(
    @Req() req: any,
    @Param('productId') productId: string,
  ) {
    const data = await this.chatService.startWithProductSeller(
      req.user.id,
      productId,
    );
    return { success: true, data };
  }

  @Post('conversations/umkm-product/:productId/seller')
  async startUmkmProductSeller(
    @Req() req: any,
    @Param('productId') productId: string,
  ) {
    const data = await this.chatService.startWithUmkmProductSeller(
      req.user.id,
      productId,
    );
    return { success: true, data };
  }

  @Post('conversations/order/:orderId/customer')
  async startOrderCustomer(@Req() req: any, @Param('orderId') orderId: string) {
    const data = await this.chatService.startFromSellerOrder(
      req.user.id,
      orderId,
      'customer',
    );
    return { success: true, data };
  }

  @Post('conversations/order/:orderId/courier')
  async startOrderCourier(@Req() req: any, @Param('orderId') orderId: string) {
    const data = await this.chatService.startFromSellerOrder(
      req.user.id,
      orderId,
      'courier',
    );
    return { success: true, data };
  }

  @Get('conversations/:id/messages')
  async messages(@Req() req: any, @Param('id') id: string) {
    const data = await this.chatService.getMessages(req.user.id, id);
    return { success: true, data };
  }

  @Post('conversations/:id/messages')
  async send(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const data = await this.chatService.sendMessage(
      req.user.id,
      id,
      dto.content,
    );
    return { success: true, data };
  }

  @Patch('conversations/:id/read')
  async read(@Req() req: any, @Param('id') id: string) {
    const data = await this.chatService.markRead(req.user.id, id);
    return { success: true, data };
  }
}

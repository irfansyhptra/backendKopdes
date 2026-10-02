import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Role } from '@prisma/client';
import { ChatChannel } from './dto/chat.dto';

const userSelect = { id: true, name: true, role: true, email: true };

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  // Urutkan pasangan agar unik & idempoten.
  private orderPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private channelForRoles(first: Role, second: Role): ChatChannel {
    const roles = new Set<Role>([first, second]);
    const sellerRoles = [Role.UMKM, Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES];
    const hasSeller = sellerRoles.some((role) => roles.has(role));

    if (roles.has(Role.CUSTOMER) && hasSeller) {
      return ChatChannel.MARKETPLACE;
    }
    if (roles.has(Role.COURIER) && hasSeller) {
      return ChatChannel.DELIVERY;
    }
    return ChatChannel.GENERAL;
  }

  private shape(conv: any, meId: string) {
    const other = conv.user1Id === meId ? conv.user2 : conv.user1;
    return {
      id: conv.id,
      lastMessageAt: conv.lastMessageAt,
      otherUser: other,
      lastMessage: conv.messages?.[0] ?? null,
      unreadCount: conv._count?.messages ?? 0,
      channel: this.channelForRoles(conv.user1.role, conv.user2.role),
    };
  }

  async getOrCreate(
    meId: string,
    recipientId: string,
    requestedChannel?: ChatChannel,
  ) {
    if (meId === recipientId) {
      throw new BadRequestException(
        'Tidak bisa memulai percakapan dengan diri sendiri',
      );
    }
    const [me, recipient] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: meId } }),
      this.prisma.user.findUnique({ where: { id: recipientId } }),
    ]);
    if (!me) throw new NotFoundException('Pengguna tidak ditemukan');
    if (!recipient) throw new NotFoundException('Penerima tidak ditemukan');

    const actualChannel = this.channelForRoles(me.role, recipient.role);
    if (requestedChannel && requestedChannel !== actualChannel) {
      throw new ForbiddenException(
        requestedChannel === ChatChannel.DELIVERY
          ? 'Chat kurir hanya untuk penjual dan kurir'
          : 'Chat penjualan hanya untuk pembeli dan penjual',
      );
    }

    const [user1Id, user2Id] = this.orderPair(meId, recipientId);

    const conv = await this.prisma.conversation.upsert({
      where: { user1Id_user2Id: { user1Id, user2Id } },
      create: { user1Id, user2Id },
      update: {},
      include: { user1: { select: userSelect }, user2: { select: userSelect } },
    });

    return this.shape({ ...conv, messages: [], _count: { messages: 0 } }, meId);
  }

  async listConversations(meId: string, channel?: ChatChannel) {
    const convs = await this.prisma.conversation.findMany({
      where: { OR: [{ user1Id: meId }, { user2Id: meId }] },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user1: { select: userSelect },
        user2: { select: userSelect },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: {
          select: {
            messages: { where: { senderId: { not: meId }, readAt: null } },
          },
        },
      },
    });

    const shaped = convs.map((c) => this.shape(c, meId));
    return channel
      ? shaped.filter((conversation) => conversation.channel === channel)
      : shaped;
  }

  /// Pembeli memulai chat dari halaman produk Kopdes. Produk menentukan
  /// Kopdes, lalu admin aktif pada Kopdes tersebut menjadi penerima.
  async startWithProductSeller(meId: string, productId: string) {
    const me = await this.prisma.user.findUnique({ where: { id: meId } });
    if (!me || me.role !== Role.CUSTOMER) {
      throw new ForbiddenException('Chat produk hanya dapat dimulai pembeli');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { kopdesId: true },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');
    if (!product.kopdesId) {
      throw new BadRequestException('Produk belum terhubung dengan Kopdes');
    }

    const seller = await this.prisma.user.findFirst({
      where: {
        kopdesId: product.kopdesId,
        role: { in: [Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES] },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    if (!seller) {
      throw new NotFoundException('Penjual produk belum dapat dihubungi');
    }
    return this.getOrCreate(meId, seller.id, ChatChannel.MARKETPLACE);
  }

  /// Produk UMKM memiliki pemilik tunggal, jadi penerimanya dapat diambil
  /// langsung dari relasi UMKM -> User.
  async startWithUmkmProductSeller(meId: string, productId: string) {
    const me = await this.prisma.user.findUnique({ where: { id: meId } });
    if (!me || me.role !== Role.CUSTOMER) {
      throw new ForbiddenException('Chat produk hanya dapat dimulai pembeli');
    }

    const product = await this.prisma.uMKMProduct.findUnique({
      where: { id: productId },
      select: { umkm: { select: { userId: true } } },
    });
    if (!product) throw new NotFoundException('Produk UMKM tidak ditemukan');
    return this.getOrCreate(meId, product.umkm.userId, ChatChannel.MARKETPLACE);
  }

  /// Penjual UMKM memulai chat dari pesanan yang memang berisi produknya.
  /// Target hanya boleh pembeli pesanan atau kurir yang sudah ditugaskan.
  async startFromSellerOrder(
    meId: string,
    orderId: string,
    target: 'customer' | 'courier',
  ) {
    const umkm = await this.prisma.uMKM.findUnique({ where: { userId: meId } });
    if (!umkm) {
      throw new ForbiddenException('Pesanan ini bukan milik toko Anda');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
      },
      include: { delivery: { select: { courierId: true } } },
    });
    if (!order) {
      throw new ForbiddenException('Pesanan ini bukan milik toko Anda');
    }

    if (target === 'customer') {
      return this.getOrCreate(meId, order.customerId, ChatChannel.MARKETPLACE);
    }
    const courierId = order.delivery?.courierId;
    if (!courierId) {
      throw new BadRequestException('Kurir belum ditugaskan pada pesanan');
    }
    return this.getOrCreate(meId, courierId, ChatChannel.DELIVERY);
  }

  private async assertParticipant(meId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Percakapan tidak ditemukan');
    if (conv.user1Id !== meId && conv.user2Id !== meId) {
      throw new ForbiddenException('Anda bukan peserta percakapan ini');
    }
    return conv;
  }

  async getMessages(meId: string, conversationId: string) {
    await this.assertParticipant(meId, conversationId);
    return this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: userSelect } },
    });
  }

  async sendMessage(meId: string, conversationId: string, content: string) {
    await this.assertParticipant(meId, conversationId);

    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { conversationId, senderId: meId, content },
        include: { sender: { select: userSelect } },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return message;
  }

  async markRead(meId: string, conversationId: string) {
    await this.assertParticipant(meId, conversationId);
    await this.prisma.chatMessage.updateMany({
      where: { conversationId, senderId: { not: meId }, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}

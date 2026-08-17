import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const userSelect = { id: true, name: true, role: true, email: true };

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  // Urutkan pasangan agar unik & idempoten.
  private orderPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private shape(conv: any, meId: string) {
    const other = conv.user1Id === meId ? conv.user2 : conv.user1;
    return {
      id: conv.id,
      lastMessageAt: conv.lastMessageAt,
      otherUser: other,
      lastMessage: conv.messages?.[0] ?? null,
      unreadCount: conv._count?.messages ?? 0,
    };
  }

  async getOrCreate(meId: string, recipientId: string) {
    if (meId === recipientId) {
      throw new BadRequestException('Tidak bisa memulai percakapan dengan diri sendiri');
    }
    const recipient = await this.prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) throw new NotFoundException('Penerima tidak ditemukan');

    const [user1Id, user2Id] = this.orderPair(meId, recipientId);

    const conv = await this.prisma.conversation.upsert({
      where: { user1Id_user2Id: { user1Id, user2Id } },
      create: { user1Id, user2Id },
      update: {},
      include: { user1: { select: userSelect }, user2: { select: userSelect } },
    });

    return this.shape({ ...conv, messages: [], _count: { messages: 0 } }, meId);
  }

  async listConversations(meId: string) {
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

    return convs.map((c) => this.shape(c, meId));
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

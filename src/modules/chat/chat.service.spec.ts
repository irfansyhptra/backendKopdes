import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ChatService } from './chat.service';
import { ChatChannel } from './dto/chat.dto';

function conversation(
  id: string,
  user1: { id: string; role: Role },
  user2: { id: string; role: Role },
) {
  return {
    id,
    user1Id: user1.id,
    user2Id: user2.id,
    user1: { ...user1, name: user1.id },
    user2: { ...user2, name: user2.id },
    lastMessageAt: new Date('2026-01-01T00:00:00Z'),
    messages: [],
    _count: { messages: 0 },
  };
}

function build() {
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    product: { findUnique: jest.fn() },
    uMKMProduct: { findUnique: jest.fn() },
    uMKM: { findUnique: jest.fn() },
    order: { findFirst: jest.fn() },
    conversation: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = Object.create(ChatService.prototype) as ChatService;
  Object.assign(service, { prisma });
  return { service, prisma };
}

describe('ChatService channels', () => {
  it('memisahkan percakapan pembeli-penjual dari penjual-kurir', async () => {
    const { service, prisma } = build();
    prisma.conversation.findMany.mockResolvedValue([
      conversation(
        'market',
        { id: 'seller', role: Role.UMKM },
        { id: 'buyer', role: Role.CUSTOMER },
      ),
      conversation(
        'delivery',
        { id: 'seller', role: Role.UMKM },
        { id: 'courier', role: Role.COURIER },
      ),
    ]);

    const marketplace = await service.listConversations(
      'seller',
      ChatChannel.MARKETPLACE,
    );
    const delivery = await service.listConversations(
      'seller',
      ChatChannel.DELIVERY,
    );

    expect(marketplace.map((item) => item.id)).toEqual(['market']);
    expect(delivery.map((item) => item.id)).toEqual(['delivery']);
  });

  it('menolak customer membuka kanal pengantaran dengan kurir', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'buyer', role: Role.CUSTOMER })
      .mockResolvedValueOnce({ id: 'courier', role: Role.COURIER });

    await expect(
      service.getOrCreate('buyer', 'courier', ChatChannel.DELIVERY),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it('mengizinkan penjual membuka kanal pengantaran dengan kurir', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'seller', role: Role.UMKM })
      .mockResolvedValueOnce({ id: 'courier', role: Role.COURIER });
    prisma.conversation.upsert.mockResolvedValue(
      conversation(
        'delivery',
        { id: 'seller', role: Role.UMKM },
        { id: 'courier', role: Role.COURIER },
      ),
    );

    const result = await service.getOrCreate(
      'seller',
      'courier',
      ChatChannel.DELIVERY,
    );

    expect(result.channel).toBe(ChatChannel.DELIVERY);
    expect(prisma.conversation.upsert).toHaveBeenCalled();
  });

  it('membuka admin Kopdes yang memiliki produk untuk pembeli', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({
      id: 'buyer',
      role: Role.CUSTOMER,
    });
    prisma.product.findUnique.mockResolvedValue({ kopdesId: 'kopdes-1' });
    prisma.user.findFirst.mockResolvedValue({
      id: 'admin-1',
      role: Role.ADMIN_KOPDES,
    });
    const open = jest
      .spyOn(service, 'getOrCreate')
      .mockResolvedValue({ id: 'conversation-1' } as any);

    await service.startWithProductSeller('buyer', 'product-1');

    expect(open).toHaveBeenCalledWith(
      'buyer',
      'admin-1',
      ChatChannel.MARKETPLACE,
    );
  });

  it('membuka kurir yang ditugaskan pada pesanan milik penjual', async () => {
    const { service, prisma } = build();
    prisma.uMKM.findUnique.mockResolvedValue({ id: 'umkm-1' });
    prisma.order.findFirst.mockResolvedValue({
      customerId: 'buyer',
      delivery: { courierId: 'courier' },
    });
    const open = jest
      .spyOn(service, 'getOrCreate')
      .mockResolvedValue({ id: 'conversation-2' } as any);

    await service.startFromSellerOrder('seller', 'order-1', 'courier');

    expect(open).toHaveBeenCalledWith(
      'seller',
      'courier',
      ChatChannel.DELIVERY,
    );
  });

  it('membuka pemilik produk UMKM untuk pembeli', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({
      id: 'buyer',
      role: Role.CUSTOMER,
    });
    prisma.uMKMProduct.findUnique.mockResolvedValue({
      umkm: { userId: 'seller' },
    });
    const open = jest
      .spyOn(service, 'getOrCreate')
      .mockResolvedValue({ id: 'conversation-3' } as any);

    await service.startWithUmkmProductSeller('buyer', 'umkm-product-1');

    expect(open).toHaveBeenCalledWith(
      'buyer',
      'seller',
      ChatChannel.MARKETPLACE,
    );
  });
});

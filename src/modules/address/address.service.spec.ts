import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AddressService } from './address.service';

describe('AddressService', () => {
  const OWNER = 'user-1';
  const STRANGER = 'user-2';

  const addressRow = (overrides: any = {}) => ({
    id: 'addr-1',
    userId: OWNER,
    title: 'Rumah',
    isDefault: false,
    ...overrides,
  });

  const validDto = {
    title: 'Rumah',
    recipientName: 'Siti',
    phone: '0811',
    street: 'Jl. Cot Mesjid No. 3',
    city: 'Banda Aceh',
    state: 'Aceh',
    postalCode: '23111',
  };

  let prisma: any;
  let tx: any;
  let service: AddressService;

  beforeEach(() => {
    tx = {
      address: {
        create: jest.fn(async (a: any) => a.data),
        update: jest.fn(async (a: any) => ({ ...addressRow(), ...a.data })),
        updateMany: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(async () => null),
      },
    };

    prisma = {
      address: {
        findUnique: jest.fn(async () => addressRow()),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      order: { count: jest.fn(async () => 0) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    service = new AddressService(prisma);
  });

  describe('getOwnedAddress', () => {
    it('menolak alamat yang tidak ada', async () => {
      prisma.address.findUnique.mockResolvedValue(null);
      await expect(service.getOwnedAddress(OWNER, 'hilang')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('menolak alamat milik orang lain', async () => {
      await expect(service.getOwnedAddress(STRANGER, 'addr-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('mengembalikan alamat milik sendiri', async () => {
      await expect(service.getOwnedAddress(OWNER, 'addr-1')).resolves.toEqual(
        addressRow(),
      );
    });
  });

  describe('create', () => {
    it('alamat pertama otomatis jadi alamat utama', async () => {
      const created = await service.create(OWNER, validDto as any);
      expect(created.isDefault).toBe(true);
    });

    it('alamat berikutnya tidak otomatis jadi utama', async () => {
      prisma.address.count.mockResolvedValue(2);
      const created = await service.create(OWNER, validDto as any);
      expect(created.isDefault).toBe(false);
      expect(tx.address.updateMany).not.toHaveBeenCalled();
    });

    it('menyetel utama akan melepas utama yang lama', async () => {
      prisma.address.count.mockResolvedValue(2);
      await service.create(OWNER, { ...validDto, isDefault: true } as any);
      expect(tx.address.updateMany).toHaveBeenCalledWith({
        where: { userId: OWNER, isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('resolveForOrder', () => {
    it('tanpa pilihan apa pun: pakai alamat utama dari profil', async () => {
      prisma.address.findFirst = jest.fn(async () =>
        addressRow({ id: 'addr-default', isDefault: true }),
      );

      const resolved = await service.resolveForOrder(OWNER, {});

      expect(resolved.id).toBe('addr-default');
      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { userId: OWNER, isDefault: true },
      });
    });

    it('menolak checkout kalau profil belum punya alamat utama', async () => {
      prisma.address.findFirst = jest.fn(async () => null);

      await expect(service.resolveForOrder(OWNER, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('memakai alamat tersimpan yang dipilih', async () => {
      const resolved = await service.resolveForOrder(OWNER, {
        deliveryAddressId: 'addr-1',
      });
      expect(resolved.id).toBe('addr-1');
    });

    it('menolak alamat tersimpan milik orang lain', async () => {
      await expect(
        service.resolveForOrder(STRANGER, { deliveryAddressId: 'addr-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('menyimpan alamat baru yang diketik saat checkout', async () => {
      prisma.address.count.mockResolvedValue(2);

      await service.resolveForOrder(OWNER, { deliveryAddress: validDto as any });

      expect(tx.address.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: OWNER, street: validDto.street }),
      });
    });

    it('alamat baru saat checkout tidak menggeser alamat utama', async () => {
      prisma.address.count.mockResolvedValue(2);

      const created = await service.resolveForOrder(OWNER, {
        deliveryAddress: validDto as any,
      });

      expect(created.isDefault).toBe(false);
      expect(tx.address.updateMany).not.toHaveBeenCalled();
    });

    it('alamat baru boleh sekalian dijadikan utama bila diminta', async () => {
      prisma.address.count.mockResolvedValue(2);

      const created = await service.resolveForOrder(OWNER, {
        deliveryAddress: { ...validDto, isDefault: true } as any,
      });

      expect(created.isDefault).toBe(true);
      expect(tx.address.updateMany).toHaveBeenCalled();
    });

    it('menolak kalau alamat tersimpan dan alamat baru dikirim sekaligus', async () => {
      await expect(
        service.resolveForOrder(OWNER, {
          deliveryAddressId: 'addr-1',
          deliveryAddress: validDto as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('menolak mengubah alamat orang lain', async () => {
      await expect(
        service.update(STRANGER, 'addr-1', { title: 'Bajak' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('menjadikan utama akan melepas utama yang lama', async () => {
      await service.update(OWNER, 'addr-1', { isDefault: true } as any);
      expect(tx.address.updateMany).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('menolak menghapus alamat orang lain', async () => {
      await expect(service.remove(STRANGER, 'addr-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('menolak menghapus alamat yang sudah dipakai pesanan', async () => {
      prisma.order.count.mockResolvedValue(3);
      await expect(service.remove(OWNER, 'addr-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('menghapus alamat yang belum dipakai', async () => {
      await expect(service.remove(OWNER, 'addr-1')).resolves.toEqual({
        id: 'addr-1',
        deleted: true,
      });
      expect(tx.address.delete).toHaveBeenCalledWith({ where: { id: 'addr-1' } });
    });

    it('mengangkat alamat lain jadi utama saat alamat utama dihapus', async () => {
      prisma.address.findUnique.mockResolvedValue(addressRow({ isDefault: true }));
      tx.address.findFirst.mockResolvedValue(addressRow({ id: 'addr-2' }));

      await service.remove(OWNER, 'addr-1');

      expect(tx.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { isDefault: true },
      });
    });

    it('tidak mengangkat apa pun kalau alamat habis', async () => {
      prisma.address.findUnique.mockResolvedValue(addressRow({ isDefault: true }));
      await service.remove(OWNER, 'addr-1');
      expect(tx.address.update).not.toHaveBeenCalled();
    });
  });
});

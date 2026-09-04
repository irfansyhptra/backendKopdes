import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil alamat sekaligus memastikan ia milik pemanggil.
   * Dipakai ulang oleh OrderService saat checkout, supaya aturan kepemilikan
   * alamat hanya ditulis di satu tempat.
   */
  async getOwnedAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Alamat pengiriman tidak ditemukan');
    }
    if (address.userId !== userId) {
      throw new ForbiddenException('Alamat ini bukan milik Anda');
    }

    return address;
  }

  /**
   * Menentukan alamat pengiriman untuk sebuah pesanan.
   *
   * Alamat utama disetel pengguna di profilnya dan dipakai secara default,
   * tapi saat checkout ia boleh memilih alamat tersimpan lain atau mengetik
   * alamat baru. Alamat baru ikut tersimpan ke buku alamat — `Order` menunjuk
   * ke baris `Address` sungguhan, jadi tidak ada alamat sekali pakai — namun
   * tidak menggeser alamat utama kecuali `isDefault` diminta secara eksplisit.
   */
  async resolveForOrder(
    userId: string,
    selection: { deliveryAddressId?: string; deliveryAddress?: CreateAddressDto },
  ) {
    if (selection.deliveryAddressId && selection.deliveryAddress) {
      throw new BadRequestException(
        'Pilih alamat tersimpan atau isi alamat baru, jangan keduanya',
      );
    }

    if (selection.deliveryAddress) {
      return this.create(userId, {
        ...selection.deliveryAddress,
        isDefault: selection.deliveryAddress.isDefault ?? false,
      });
    }

    if (selection.deliveryAddressId) {
      return this.getOwnedAddress(userId, selection.deliveryAddressId);
    }

    const fallback = await this.prisma.address.findFirst({
      where: { userId, isDefault: true },
    });
    if (!fallback) {
      throw new BadRequestException(
        'Belum ada alamat utama di profil Anda. Pilih alamat tersimpan atau isi alamat pengiriman baru.',
      );
    }
    return fallback;
  }

  /** Alamat utama tampil pertama, sisanya terbaru dulu. */
  async list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    const existingCount = await this.prisma.address.count({ where: { userId } });
    // Alamat pertama otomatis jadi alamat utama — supaya pengguna tidak pernah
    // punya daftar alamat tanpa satu pun yang default.
    const isDefault = dto.isDefault ?? existingCount === 0;

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: { ...dto, userId, isDefault },
      });
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.getOwnedAddress(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: dto,
      });
    });
  }

  async remove(userId: string, addressId: string) {
    const address = await this.getOwnedAddress(userId, addressId);

    // Order.deliveryAddressId wajib terisi, jadi alamat yang sudah dipakai
    // pesanan tidak boleh hilang — riwayat pesanannya ikut rusak.
    const usedByOrders = await this.prisma.order.count({
      where: { deliveryAddressId: addressId },
    });
    if (usedByOrders > 0) {
      throw new BadRequestException(
        `Alamat ini dipakai oleh ${usedByOrders} pesanan dan tidak bisa dihapus`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: addressId } });

      // Kalau yang dihapus adalah alamat utama, angkat alamat terbaru
      // sebagai penggantinya.
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { id: addressId, deleted: true };
  }
}

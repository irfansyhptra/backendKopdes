import {
  DeliveryStatus,
  FulfillmentMethod,
  OrderStatus,
  Prisma,
  Role,
} from '@prisma/client';

/** Pengantaran yang masih dipegang kurir — penentu beban kerjanya. */
const ACTIVE: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.ACCEPTED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
];

/**
 * Menyerahkan pesanan antar ke kurir Kopdes-nya, di dalam transaksi pemanggil.
 *
 * Sebelumnya tidak ada jalur yang membuat baris `Delivery` untuk pesanan
 * sungguhan, jadi pesanan "Siap Dikirim" tidak pernah sampai ke kurir mana
 * pun. Kurir dipilih yang beban aktifnya paling sedikit. Bila Kopdes belum
 * punya kurir, pengantarannya tetap dibuat tanpa kurir dan pesanan menunggu
 * di READY_FOR_DELIVERY sampai pengurus menugaskan seseorang.
 *
 * Pesanan ambil sendiri tidak disentuh. Idempoten: pengantaran yang sudah
 * ada dipakai ulang, kurirnya tidak diganti.
 *
 * @returns status pesanan setelah penyerahan.
 */
export async function handOverToCourier(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<OrderStatus | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      fulfillment: true,
      delivery: { select: { courierId: true } },
      items: {
        take: 1,
        select: {
          product: { select: { kopdesId: true } },
          umkmProduct: { select: { umkm: { select: { kopdesId: true } } } },
        },
      },
    },
  });
  if (!order || order.fulfillment !== FulfillmentMethod.DELIVERY) return null;

  let courierId = order.delivery?.courierId ?? null;
  if (!courierId) {
    const item = order.items[0];
    const kopdesId =
      item?.product?.kopdesId ?? item?.umkmProduct?.umkm.kopdesId ?? null;
    if (kopdesId) {
      const couriers = await tx.user.findMany({
        where: { role: Role.COURIER, kopdesId },
        select: {
          id: true,
          _count: {
            select: { deliveries: { where: { status: { in: ACTIVE } } } },
          },
        },
      });
      couriers.sort(
        (a, b) =>
          a._count.deliveries - b._count.deliveries || a.id.localeCompare(b.id),
      );
      courierId = couriers[0]?.id ?? null;
    }
  }

  await tx.delivery.upsert({
    where: { orderId },
    create: { orderId, courierId, status: DeliveryStatus.ASSIGNED },
    update: { courierId },
  });

  const status = courierId
    ? OrderStatus.OUT_FOR_DELIVERY
    : OrderStatus.READY_FOR_DELIVERY;
  await tx.order.update({ where: { id: orderId }, data: { status } });
  return status;
}

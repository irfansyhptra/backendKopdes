import {
  DeliveryStatus,
  FulfillmentMethod,
  OrderStatus,
  Prisma,
} from '@prisma/client';

/**
 * Menaruh pesanan antar ke kumpulan tugas kurir, di dalam transaksi pemanggil.
 *
 * Sebelumnya tidak ada jalur yang membuat baris `Delivery` untuk pesanan
 * sungguhan, jadi pesanan "Siap Dikirim" tidak pernah sampai ke kurir mana
 * pun. Sekarang pengantarannya dibuat tanpa kurir: kurir Kopdes melihatnya
 * di daftar tugas tersedia dan mengambilnya sendiri. Pengurus tidak perlu
 * menugaskan siapa pun, tetapi tetap bisa — lewat `assignCourier` — bila
 * sebuah tugas terlalu lama tidak diambil.
 *
 * Pesanan ambil sendiri tidak disentuh. Idempoten: pengantaran yang sudah
 * ada dibiarkan apa adanya, termasuk kurir yang sudah memegangnya.
 *
 * @returns status pesanan setelah penyerahan, atau null bila bukan antar.
 */
export async function handOverToCourier(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<OrderStatus | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { fulfillment: true },
  });
  if (!order || order.fulfillment !== FulfillmentMethod.DELIVERY) return null;

  await tx.delivery.upsert({
    where: { orderId },
    create: { orderId, status: DeliveryStatus.ASSIGNED },
    // Tugas yang sudah dipegang kurir tidak dilepas hanya karena statusnya
    // disentuh ulang.
    update: {},
  });

  // "Siap diambil kurir" — itu juga yang dibaca pemesan. Pesanan baru
  // berangkat (OUT_FOR_DELIVERY) setelah kurir menandai barang diambil.
  await tx.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.READY_FOR_DELIVERY },
  });
  return OrderStatus.READY_FOR_DELIVERY;
}

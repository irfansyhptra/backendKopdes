import { OrderStatus } from '@prisma/client';

/**
 * Transisi status pesanan yang sah.
 *
 * Sebelumnya staf boleh menulis status apa pun ke pesanan mana pun, sehingga
 * `PENDING → COMPLETED` bisa terjadi dalam satu ketukan: pesanan tercatat
 * selesai tanpa pernah disiapkan, dikirim, atau diterima, dan stok maupun
 * pembayaran ikut salah. Peta ini yang menutup lompatan itu — di backend,
 * bukan dengan menyembunyikan tombol.
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // Urutan penting: elemen pertama adalah tindakan utama yang ditawarkan
  // dashboard staf, jadi "Proses" mendahului pencatatan pembayaran manual.
  PENDING: ['PROCESSING', 'PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DELIVERY: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  // Setelah barang keluar toko, pembatalan bukan lagi urusan kasir:
  // pesanan harus kembali dulu lewat alur pengiriman.
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Label tombol tindakan utama untuk sebuah status. Dipakai dashboard staf. */
export function nextActionFor(status: OrderStatus): OrderStatus | null {
  const [next] = ALLOWED_ORDER_TRANSITIONS[status] ?? [];
  return next === 'CANCELLED' ? null : (next ?? null);
}

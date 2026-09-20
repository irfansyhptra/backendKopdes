import { OrderStatus } from '@prisma/client';

import { PERIODS, PERIOD_DAYS } from './period';

/**
 * Status yang dihitung sebagai penjualan. Disalin dari discovery.service.ts —
 * konstanta di sana sengaja tidak diekspor, dan test ini menjaga agar
 * daftarnya tidak diam-diam berubah.
 */
const SOLD_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

describe('aturan status penjualan', () => {
  // Kalau CANCELLED ikut terhitung, "Terjual 240+" menjadi angka yang tidak
  // pernah benar-benar terjadi.
  it('tidak menghitung pesanan yang dibatalkan', () => {
    expect(SOLD_STATUSES).not.toContain(OrderStatus.CANCELLED);
  });

  // PENDING belum tentu jadi — pesanan bisa batal sebelum dibayar.
  it('tidak menghitung pesanan yang belum dibayar', () => {
    expect(SOLD_STATUSES).not.toContain(OrderStatus.PENDING);
  });

  it('menghitung seluruh status setelah pembayaran', () => {
    for (const status of [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_DELIVERY,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ]) {
      expect(SOLD_STATUSES).toContain(status);
    }
  });

  // Penjaga: kalau ada status baru ditambahkan ke enum, keputusan
  // memasukkannya atau tidak harus diambil sadar, bukan terlewat.
  it('setiap status pesanan sudah diputuskan masuk atau tidak', () => {
    const semua = Object.values(OrderStatus);
    const dikecualikan = [OrderStatus.PENDING, OrderStatus.CANCELLED];
    expect(semua.sort()).toEqual([...SOLD_STATUSES, ...dikecualikan].sort());
  });
});

describe('rentang waktu', () => {
  it('setiap periode punya jumlah hari', () => {
    for (const period of PERIODS) {
      expect(PERIOD_DAYS).toHaveProperty(period);
    }
  });

  it('"all" berarti tanpa batas waktu', () => {
    expect(PERIOD_DAYS.all).toBeNull();
  });

  it('periode berjangka memakai hari yang benar', () => {
    expect(PERIOD_DAYS['7d']).toBe(7);
    expect(PERIOD_DAYS['30d']).toBe(30);
    expect(PERIOD_DAYS['90d']).toBe(90);
  });
});

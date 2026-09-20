import { OrderStatus } from '@prisma/client';
import {
  ALLOWED_ORDER_TRANSITIONS,
  canTransition,
  nextActionFor,
} from './order-transitions';

describe('transisi status pesanan', () => {
  it('mengizinkan alur normal dari pesanan masuk sampai selesai', () => {
    const flow: OrderStatus[] = [
      'PENDING',
      'PROCESSING',
      'READY_FOR_DELIVERY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
    ];
    for (let i = 0; i < flow.length - 1; i++) {
      expect(canTransition(flow[i], flow[i + 1])).toBe(true);
    }
  });

  it('menolak lompatan yang melewati tahap kerja', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(canTransition('PENDING', 'OUT_FOR_DELIVERY')).toBe(false);
    expect(canTransition('PROCESSING', 'DELIVERED')).toBe(false);
  });

  it('menolak mundurnya status', () => {
    expect(canTransition('READY_FOR_DELIVERY', 'PROCESSING')).toBe(false);
    expect(canTransition('DELIVERED', 'OUT_FOR_DELIVERY')).toBe(false);
  });

  it('status final tidak bisa diubah lagi', () => {
    expect(ALLOWED_ORDER_TRANSITIONS.COMPLETED).toHaveLength(0);
    expect(ALLOWED_ORDER_TRANSITIONS.CANCELLED).toHaveLength(0);
    expect(canTransition('CANCELLED', 'PROCESSING')).toBe(false);
  });

  it('pembatalan hanya sampai sebelum barang keluar toko', () => {
    expect(canTransition('READY_FOR_DELIVERY', 'CANCELLED')).toBe(true);
    expect(canTransition('OUT_FOR_DELIVERY', 'CANCELLED')).toBe(false);
  });

  it('tindakan utama dashboard mengikuti status, dan bukan pembatalan', () => {
    expect(nextActionFor('PENDING')).toBe('PROCESSING');
    expect(nextActionFor('PROCESSING')).toBe('READY_FOR_DELIVERY');
    expect(nextActionFor('READY_FOR_DELIVERY')).toBe('OUT_FOR_DELIVERY');
    expect(nextActionFor('COMPLETED')).toBeNull();
  });
});

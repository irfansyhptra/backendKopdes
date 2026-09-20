import { OrderStatus, PaymentStatus } from '@prisma/client';
import {
  isFinal,
  normalizeCharge,
  orderStatusFor,
  paymentStatusFrom,
  shouldApply,
  viewFromMidtrans,
} from './payment-status';
import { PaymentService } from './payment.service';

/**
 * Pemetaan status dan normalisasi respons.
 *
 * Fungsi murni, diuji tanpa jaringan maupun database — dan diuji ketat,
 * karena satu baris di sini menentukan apakah sebuah pesanan dianggap lunas.
 */

describe('viewFromMidtrans', () => {
  it('settlement berarti lunas', () => {
    expect(viewFromMidtrans('settlement')).toBe('PAID');
  });

  it('capture hanya lunas bila fraud_status accept', () => {
    expect(viewFromMidtrans('capture', 'accept')).toBe('PAID');
    // `challenge` menunggu keputusan manual; menandainya lunas berarti
    // mengirim barang atas transaksi yang belum tentu sah.
    expect(viewFromMidtrans('capture', 'challenge')).toBe('PENDING');
    expect(viewFromMidtrans('capture', 'deny')).toBe('PENDING');
    expect(viewFromMidtrans('capture')).toBe('PENDING');
  });

  it('memetakan status penolakan dan pembatalan', () => {
    expect(viewFromMidtrans('deny')).toBe('DENIED');
    expect(viewFromMidtrans('cancel')).toBe('CANCELLED');
    expect(viewFromMidtrans('expire')).toBe('EXPIRED');
    expect(viewFromMidtrans('failure')).toBe('FAILED');
  });

  it('refund penuh maupun sebagian dianggap dana kembali', () => {
    expect(viewFromMidtrans('refund')).toBe('REFUNDED');
    expect(viewFromMidtrans('partial_refund')).toBe('REFUNDED');
  });

  it('status tak dikenal jatuh ke menunggu, bukan lunas', () => {
    // Menebak "lunas" untuk status yang belum dikenal adalah cara termahal
    // untuk salah.
    expect(viewFromMidtrans('sesuatu_yang_baru')).toBe('PENDING');
    expect(viewFromMidtrans(null)).toBe('PENDING');
    expect(viewFromMidtrans(undefined)).toBe('PENDING');
  });
});

describe('paymentStatusFrom', () => {
  it('menyempitkan ke empat nilai enum Prisma', () => {
    expect(paymentStatusFrom('PAID')).toBe(PaymentStatus.PAID);
    expect(paymentStatusFrom('REFUNDED')).toBe(PaymentStatus.REFUNDED);
    expect(paymentStatusFrom('PENDING')).toBe(PaymentStatus.PENDING);
    for (const v of ['DENIED', 'CANCELLED', 'EXPIRED', 'FAILED'] as const) {
      expect(paymentStatusFrom(v)).toBe(PaymentStatus.FAILED);
    }
  });
});

describe('shouldApply', () => {
  it('menerima perpindahan dari menunggu', () => {
    expect(shouldApply('PENDING', 'PAID')).toBe(true);
    expect(shouldApply('PENDING', 'EXPIRED')).toBe(true);
  });

  it('menolak status yang sama dua kali', () => {
    expect(shouldApply('PAID', 'PAID')).toBe(false);
  });

  it('status akhir tidak turun kembali menjadi menunggu', () => {
    // Midtrans tidak menjamin urutan: `pending` yang terlambat bisa tiba
    // setelah `settlement`, dan pesanan lunas akan kembali tampil menunggu.
    expect(shouldApply('PAID', 'PENDING')).toBe(false);
    expect(shouldApply('EXPIRED', 'PENDING')).toBe(false);
  });

  it('hanya pengembalian dana yang boleh menyusul pelunasan', () => {
    expect(shouldApply('PAID', 'REFUNDED')).toBe(true);
    expect(shouldApply('PAID', 'CANCELLED')).toBe(false);
    expect(shouldApply('EXPIRED', 'PAID')).toBe(false);
  });

  it('isFinal menandai status yang berhenti berubah', () => {
    expect(isFinal('PENDING')).toBe(false);
    for (const v of ['PAID', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED'] as const) {
      expect(isFinal(v)).toBe(true);
    }
  });
});

describe('orderStatusFor', () => {
  it('lunas memindahkan pesanan ke PAID', () => {
    expect(orderStatusFor('PAID')).toBe(OrderStatus.PAID);
  });

  it('kedaluwarsa dan penolakan membatalkan pesanan', () => {
    for (const v of ['EXPIRED', 'CANCELLED', 'DENIED', 'FAILED'] as const) {
      expect(orderStatusFor(v)).toBe(OrderStatus.CANCELLED);
    }
  });

  it('menunggu dan refund tidak memindahkan pesanan', () => {
    // Barang yang sudah diproses tidak batal hanya karena dananya kembali.
    expect(orderStatusFor('PENDING')).toBeNull();
    expect(orderStatusFor('REFUNDED')).toBeNull();
  });
});

describe('normalizeCharge', () => {
  it('QRIS: mengambil URL dari action generate-qr-code', () => {
    const out = normalizeCharge(
      {
        status_code: '201',
        status_message: 'ok',
        transaction_status: 'pending',
        gross_amount: '50000.00',
        actions: [
          { name: 'generate-qr-code', method: 'GET', url: 'https://mt/qr.png' },
        ],
      },
      'QRIS',
    );
    // QR wajib dari Midtrans; yang digambar sendiri tidak diakui penerbitnya.
    expect(out.qrCodeUrl).toBe('https://mt/qr.png');
    expect(out.grossAmount).toBe(50000);
  });

  it('GoPay: mengambil deeplink dari action', () => {
    const out = normalizeCharge(
      {
        status_code: '201',
        status_message: 'ok',
        actions: [
          { name: 'generate-qr-code', method: 'GET', url: 'https://mt/q.png' },
          { name: 'deeplink-redirect', method: 'GET', url: 'gojek://pay' },
        ],
      },
      'GOPAY',
    );
    expect(out.deeplinkUrl).toBe('gojek://pay');
    expect(out.qrCodeUrl).toBe('https://mt/q.png');
  });

  it('VA bank: membaca va_numbers', () => {
    const out = normalizeCharge(
      {
        status_code: '201',
        status_message: 'ok',
        va_numbers: [{ bank: 'bca', va_number: '12345678' }],
      },
      'BCA_VA',
    );
    expect(out.bank).toBe('bca');
    expect(out.vaNumber).toBe('12345678');
  });

  it('Permata: nomornya di field tersendiri, bukan di va_numbers', () => {
    const out = normalizeCharge(
      { status_code: '201', status_message: 'ok', permata_va_number: '8888' },
      'PERMATA_VA',
    );
    // Melewatkan cabang ini membuat nomor VA tidak pernah tampil padahal
    // transaksinya berhasil dibuat.
    expect(out.vaNumber).toBe('8888');
    expect(out.bank).toBe('permata');
  });

  it('Mandiri: bill_key dan biller_code, bukan nomor VA', () => {
    const out = normalizeCharge(
      {
        status_code: '201',
        status_message: 'ok',
        bill_key: '9876',
        biller_code: '70012',
      },
      'MANDIRI_BILL',
    );
    expect(out.billKey).toBe('9876');
    expect(out.billerCode).toBe('70012');
    expect(out.bank).toBe('mandiri');
  });

  it('respons tanpa actions tidak melempar', () => {
    const out = normalizeCharge(
      { status_code: '201', status_message: 'ok' },
      'QRIS',
    );
    expect(out.qrCodeUrl).toBeNull();
    expect(out.actions).toEqual([]);
  });
});

describe('buildMidtransOrderId', () => {
  it('berawalan KOMIT dan memuat jejak pesanannya', () => {
    const id = PaymentService.buildMidtransOrderId(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      1_700_000_000_000,
    );
    expect(id).toBe('KOMIT-a1b2c3d4e5f6-1700000000');
  });

  it('tidak melewati batas 50 karakter Midtrans', () => {
    const id = PaymentService.buildMidtransOrderId(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    expect(id.length).toBeLessThanOrEqual(50);
  });

  it('dua panggilan pada detik berbeda menghasilkan id berbeda', () => {
    const a = PaymentService.buildMidtransOrderId('x', 1_700_000_000_000);
    const b = PaymentService.buildMidtransOrderId('x', 1_700_000_001_000);
    expect(a).not.toBe(b);
  });
});

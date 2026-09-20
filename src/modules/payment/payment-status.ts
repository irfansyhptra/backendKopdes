import { OrderStatus, PaymentStatus } from '@prisma/client';
import type {
  MidtransChargeResponse,
  MidtransMethod,
} from './midtrans.types';

/**
 * Pemetaan status Midtrans ke status internal.
 *
 * Ditulis sebagai fungsi murni supaya bisa diuji tanpa database maupun
 * jaringan — dan karena salah satu barisnya menentukan apakah pesanan
 * dianggap lunas.
 */

/** Status yang dibaca pembeli. Bukan enum Prisma: ia lebih halus. */
export type PaymentView =
  | 'PENDING'
  | 'PAID'
  | 'DENIED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED'
  | 'REFUNDED';

export function viewFromMidtrans(
  transactionStatus: string | null | undefined,
  fraudStatus?: string | null,
): PaymentView {
  switch (transactionStatus) {
    case 'capture':
      // `capture` saja belum berarti lunas: kartu yang ditandai `challenge`
      // menunggu keputusan manual, dan `deny` justru penolakan.
      return fraudStatus === 'accept' ? 'PAID' : 'PENDING';
    case 'settlement':
      return 'PAID';
    case 'deny':
      return 'DENIED';
    case 'cancel':
      return 'CANCELLED';
    case 'expire':
      return 'EXPIRED';
    case 'failure':
      return 'FAILED';
    case 'refund':
    case 'partial_refund':
      return 'REFUNDED';
    case 'pending':
    case 'authorize':
    default:
      return 'PENDING';
  }
}

/** Padanan di enum Prisma, yang hanya punya empat nilai. */
export function paymentStatusFrom(view: PaymentView): PaymentStatus {
  switch (view) {
    case 'PAID':
      return PaymentStatus.PAID;
    case 'REFUNDED':
      return PaymentStatus.REFUNDED;
    case 'DENIED':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'FAILED':
      return PaymentStatus.FAILED;
    case 'PENDING':
      return PaymentStatus.PENDING;
  }
}

/**
 * Status akhir tidak boleh turun kembali menjadi menunggu.
 *
 * Midtrans tidak menjamin urutan kedatangan notifikasi: `pending` yang
 * terlambat bisa tiba setelah `settlement`. Tanpa penjagaan ini, pesanan
 * yang sudah dibayar akan kembali tampil menunggu pembayaran.
 */
const FINAL: PaymentView[] = [
  'PAID',
  'DENIED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'REFUNDED',
];

export function isFinal(view: PaymentView): boolean {
  return FINAL.includes(view);
}

export function shouldApply(current: PaymentView, incoming: PaymentView): boolean {
  if (current === incoming) return false;
  // Dari status akhir, hanya pengembalian dana yang masuk akal menyusul.
  if (isFinal(current)) return current === 'PAID' && incoming === 'REFUNDED';
  return true;
}

/** Status pesanan setelah pembayarannya berubah. Null berarti tidak diubah. */
export function orderStatusFor(view: PaymentView): OrderStatus | null {
  switch (view) {
    case 'PAID':
      return OrderStatus.PAID;
    case 'EXPIRED':
    case 'CANCELLED':
    case 'DENIED':
    case 'FAILED':
      return OrderStatus.CANCELLED;
    default:
      // Menunggu dan pengembalian dana tidak memindahkan pesanan sendiri:
      // barang yang sudah diproses tidak batal hanya karena dana kembali.
      return null;
  }
}

/** Bentuk yang sama untuk semua metode, apa pun jawaban Midtrans. */
export interface NormalizedCharge {
  midtransOrderId: string | null;
  transactionId: string | null;
  paymentType: string | null;
  transactionStatus: string | null;
  fraudStatus: string | null;
  grossAmount: number;
  expiryTime: string | null;
  vaNumber: string | null;
  bank: string | null;
  billKey: string | null;
  billerCode: string | null;
  qrCodeUrl: string | null;
  deeplinkUrl: string | null;
  actions: { name: string; method: string; url: string }[];
}

function actionUrl(
  res: MidtransChargeResponse,
  ...names: string[]
): string | null {
  for (const name of names) {
    const found = res.actions?.find((a) => a.name === name);
    if (found?.url) return found.url;
  }
  return null;
}

/**
 * Menyeragamkan respons charge.
 *
 * Tiap metode dijawab dengan bentuk berbeda: QRIS lewat `actions`, VA bank
 * lewat `va_numbers`, Permata lewat `permata_va_number`, Mandiri lewat
 * `bill_key`. Dinormalkan di sini supaya klien tidak perlu menumbuhkan satu
 * cabang per metode — cabang yang terlupakan berarti halaman kosong.
 */
export function normalizeCharge(
  res: MidtransChargeResponse,
  method: MidtransMethod,
): NormalizedCharge {
  const vaFromList = res.va_numbers?.[0];

  return {
    midtransOrderId: res.order_id ?? null,
    transactionId: res.transaction_id ?? null,
    paymentType: res.payment_type ?? null,
    transactionStatus: res.transaction_status ?? null,
    fraudStatus: res.fraud_status ?? null,
    grossAmount: Math.round(Number(res.gross_amount ?? 0)),
    expiryTime: res.expiry_time ?? null,

    // Permata tidak ikut di `va_numbers`; melewatkannya membuat nomor VA
    // tidak pernah tampil padahal transaksinya berhasil dibuat.
    vaNumber: vaFromList?.va_number ?? res.permata_va_number ?? null,
    bank:
      vaFromList?.bank ??
      (res.permata_va_number ? 'permata' : null) ??
      (method === 'MANDIRI_BILL' ? 'mandiri' : null),

    billKey: res.bill_key ?? null,
    billerCode: res.biller_code ?? null,

    // QR selalu dari Midtrans. QR yang digambar aplikasi sendiri bukan QR
    // yang diakui penerbitnya, dan tidak akan bisa dibayar.
    qrCodeUrl: actionUrl(res, 'generate-qr-code', 'generate-qr-code-v2'),
    deeplinkUrl: actionUrl(res, 'deeplink-redirect', 'mobile-deeplink-checkout'),

    actions: res.actions ?? [],
  };
}

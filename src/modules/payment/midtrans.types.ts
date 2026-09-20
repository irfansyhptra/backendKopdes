/**
 * Bentuk data Midtrans Core API yang benar-benar dipakai.
 *
 * Ditulis sendiri alih-alih memakai `midtrans-client`: SDK itu tidak
 * bertipe, dan yang dibutuhkan di sini hanya dua permintaan HTTP. Menuliskan
 * bentuknya membuat perbedaan antar-metode terlihat — dan perbedaan itulah
 * yang paling mudah salah ditangani.
 */

/** Metode yang aktif di akun merchant. Nilainya sama dengan enum Prisma. */
export const PAYMENT_METHODS = [
  'QRIS',
  'GOPAY',
  'SHOPEEPAY',
  'BCA_VA',
  'BNI_VA',
  'BRI_VA',
  'PERMATA_VA',
  'MANDIRI_BILL',
] as const;

export type MidtransMethod = (typeof PAYMENT_METHODS)[number];

/** Satu tindakan yang ditawarkan Midtrans (QR, deeplink, cek status). */
export interface MidtransAction {
  name: string;
  method: string;
  url: string;
}

export interface MidtransVaNumber {
  bank: string;
  va_number: string;
}

/** Respons `/v2/charge` dan `/v2/{order_id}/status`, seadanya. */
export interface MidtransChargeResponse {
  status_code: string;
  status_message: string;
  transaction_id?: string;
  order_id?: string;
  gross_amount?: string;
  payment_type?: string;
  transaction_time?: string;
  transaction_status?: string;
  fraud_status?: string;
  expiry_time?: string;
  actions?: MidtransAction[];
  va_numbers?: MidtransVaNumber[];
  permata_va_number?: string;
  bill_key?: string;
  biller_code?: string;
  [key: string]: unknown;
}

/** Notifikasi webhook. Field lain diabaikan, tapi tetap disimpan utuh. */
export interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_id: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
  [key: string]: unknown;
}

/**
 * Terjemahan metode kita ke badan permintaan Core API.
 *
 * Tiap metode punya bentuknya sendiri — itu sebabnya normalisasi dikerjakan
 * di backend, supaya klien tidak perlu tahu bahwa VA BCA dan QRIS dijawab
 * dengan struktur yang sama sekali berbeda.
 */
export function chargePayloadFor(
  method: MidtransMethod,
  callbackUrl?: string,
): Record<string, unknown> {
  switch (method) {
    case 'QRIS':
      // `acquirer: gopay` adalah penerbit QRIS bawaan Midtrans sandbox.
      return { payment_type: 'qris', qris: { acquirer: 'gopay' } };

    case 'GOPAY':
      return {
        payment_type: 'gopay',
        gopay: {
          enable_callback: true,
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        },
      };

    case 'SHOPEEPAY':
      return {
        payment_type: 'shopeepay',
        shopeepay: {
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        },
      };

    case 'BCA_VA':
      return { payment_type: 'bank_transfer', bank_transfer: { bank: 'bca' } };
    case 'BNI_VA':
      return { payment_type: 'bank_transfer', bank_transfer: { bank: 'bni' } };
    case 'BRI_VA':
      return { payment_type: 'bank_transfer', bank_transfer: { bank: 'bri' } };
    case 'PERMATA_VA':
      // Permata dijawab lewat `permata_va_number`, bukan `va_numbers`.
      return {
        payment_type: 'bank_transfer',
        bank_transfer: { bank: 'permata' },
      };

    case 'MANDIRI_BILL':
      // Mandiri memakai bill_key + biller_code, bukan nomor VA.
      return { payment_type: 'echannel', echannel: { bill_info1: 'Pembayaran', bill_info2: 'KOMIT' } };
  }
}

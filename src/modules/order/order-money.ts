import { Prisma } from '@prisma/client';

/** Komponen uang satu pesanan, semuanya `Decimal`. */
export interface OrderTotals {
  subtotal: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

/**
 * Satu-satunya tempat rumus uang pesanan ditulis.
 *
 * Dipakai `checkout` dan `createDirectOrder`. Dua jalur pembuatan pesanan
 * yang menghitung totalnya masing-masing adalah cara paling mudah membuat
 * tagihan berbeda dari yang dilihat pemesan di layar.
 *
 * `Decimal`, bukan `number`: nominal rupiah koperasi menembus batas aman
 * floating point pada rekap bulanan, dan pembulatan diam-diam pada uang
 * baru terlihat saat rekonsiliasi kas.
 */
export function composeOrderTotals(
  subtotal: Prisma.Decimal,
  options: {
    shippingFee?: Prisma.Decimal;
    discountAmount?: Prisma.Decimal;
  } = {},
): OrderTotals {
  const shippingFee = options.shippingFee ?? new Prisma.Decimal(0);
  const discountAmount = options.discountAmount ?? new Prisma.Decimal(0);

  // Diskon tidak boleh melebihi nilai barang: total negatif berarti koperasi
  // membayar pembeli, dan tidak ada jalur pengembalian uang untuk itu.
  const cappedDiscount = discountAmount.greaterThan(subtotal)
    ? subtotal
    : discountAmount;

  return {
    subtotal,
    shippingFee,
    discountAmount: cappedDiscount,
    totalAmount: subtotal.add(shippingFee).sub(cappedDiscount),
  };
}

/**
 * Ongkir untuk sebuah pesanan.
 *
 * Saat ini nol: belum ada tarif per jarak maupun kebijakan gratis ongkir yang
 * disepakati pengurus, dan menebak angkanya akan menagih pembeli untuk sesuatu
 * yang tidak pernah diputuskan. Yang berubah dari sebelumnya adalah nolnya
 * kini **tercatat** di kolomnya sendiri, sehingga rekap keuangan melaporkan
 * "Rp0 ongkir" sebagai fakta, bukan sebagai data yang hilang.
 *
 * ponytail: tarif tunggal 0. Saat tarif per jarak atau ambang gratis ongkir
 * sudah diputuskan, fungsi ini yang diisi — beserta argumen yang memang
 * dibutuhkannya saat itu.
 */
export function resolveShippingFee(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

/**
 * Potongan promo untuk sebuah pesanan.
 *
 * Nol sampai modul voucher ada. Sengaja tidak menerima nominal dari klien:
 * diskon yang boleh ditentukan perangkat pemesan adalah diskon yang bisa
 * diisi sendiri lewat request langsung ke API.
 *
 * ponytail: tanpa voucher; ganti isi fungsi ini saat modul promo ada.
 */
export function resolveDiscount(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

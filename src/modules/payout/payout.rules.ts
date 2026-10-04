/**
 * Aturan pencairan saldo mitra UMKM. Keputusan pemilik produk (4 Okt 2026).
 * Dikirim ke aplikasi lewat ringkasan saldo — aplikasi tidak menyimpan
 * salinannya.
 */
export const PAYOUT_RULES = {
  /**
   * Fee penjualan UMKM untuk Kopdes, persen dari nilai barang. Ongkir tidak
   * termasuk: backend belum mencatat UMKM yang mengantar sendiri, jadi
   * ongkir tidak dihitung sebagai hak UMKM.
   *
   * ponytail: satu tarif untuk semua pesanan, dihitung ulang setiap kali.
   * Bila tarif pernah berubah, saldo lama ikut berubah — saat itu simpan
   * tarif per pesanan (mis. di OrderItem) sebelum mengganti angka ini.
   */
  feePercent: 5,
  /** Minimum sekali tarik, rupiah. */
  minWithdrawal: 50_000,
} as const;

/** Fee dibulatkan ke rupiah terdekat, sehingga bersih + fee = kotor. */
export function splitFee(gross: number): { fee: number; net: number } {
  const fee = Math.round((gross * PAYOUT_RULES.feePercent) / 100);
  return { fee, net: gross - fee };
}

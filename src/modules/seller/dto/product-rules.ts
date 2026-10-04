/**
 * Batas isian produk UMKM. Aplikasi mencerminkan angka yang sama
 * (`ProductRules` di Flutter) supaya pesan galat muncul sebelum dikirim.
 */
export const PRODUCT_RULES = {
  nameMin: 3,
  nameMax: 120,
  descriptionMax: 500,
  priceMin: 1,
  // Decimal(12,2) menampung hingga 9.999.999.999,99.
  priceMax: 9_999_999_999,
  stockMax: 9_999_999,
} as const;

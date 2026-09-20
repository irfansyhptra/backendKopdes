/// Rentang waktu agregasi produk terlaris.
///
/// Dipisahkan dari berkas DTO: berkas itu memakai dekorator class-validator
/// yang menuntut `reflect-metadata` sudah dimuat, sehingga konstanta biasa
/// tidak bisa diimpor dari sana tanpa menyeret seluruh runtime Nest.
export const PERIODS = ['7d', '30d', '90d', 'all'] as const;

export type Period = (typeof PERIODS)[number];

/// Null berarti tanpa batas waktu.
export const PERIOD_DAYS: Record<Period, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

/**
 * Ringkasan rating hasil agregasi ulasan.
 *
 * `average` bernilai `null` bila belum ada satu ulasan pun — bukan 0. Nol
 * terbaca sebagai "dinilai sangat buruk", sedangkan yang benar adalah
 * "belum ada yang menilai", dan UI harus bisa membedakan keduanya.
 */
export interface RatingSummary {
  average: number | null;
  count: number;
}

export const EMPTY_RATING: RatingSummary = { average: null, count: 0 };

/**
 * Membulatkan rata-rata ke satu angka desimal.
 *
 * Prisma `_avg` mengembalikan presisi penuh (mis. 4.833333); yang ditampilkan
 * hanya satu desimal, dan pembulatan dilakukan di server agar semua klien
 * menampilkan angka yang sama.
 */
export function summarize(
  average: number | null | undefined,
  count: number,
): RatingSummary {
  if (!count || average === null || average === undefined) return EMPTY_RATING;
  return { average: Math.round(average * 10) / 10, count };
}

/**
 * Menyusun peta id → ringkasan rating dari hasil `groupBy`.
 *
 * Satu query agregasi untuk seluruh hasil pencarian, bukan satu query per
 * card — mencegah masalah N+1 pada endpoint terdekat.
 */
export function toRatingMap(
  groups: Array<
    { _avg: { rating: number | null }; _count: { rating: number } } & Record<
      string,
      unknown
    >
  >,
  key: string,
): Map<string, RatingSummary> {
  const map = new Map<string, RatingSummary>();
  for (const group of groups) {
    const id = group[key];
    if (typeof id !== 'string') continue;
    map.set(id, summarize(group._avg.rating, group._count.rating));
  }
  return map;
}

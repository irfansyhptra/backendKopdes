/**
 * Menentukan status buka/tutup dari kolom `operatingHours`.
 *
 * Bentuknya: `{ "mon": { "open": "07:00", "close": "17:00" }, "sun": null }`.
 * `null` atau hari yang tidak ada berarti tutup.
 *
 * Dihitung di server supaya semua klien sepakat, dan supaya `openNow` bisa
 * dipakai sebagai filter query.
 */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Zona waktu operasional koperasi. WIB = UTC+7. */
const WIB_OFFSET_MINUTES = 7 * 60;

export interface DayHours {
  open: string;
  close: string;
}

/** Menit sejak tengah malam, atau null jika formatnya tidak dikenali. */
function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Apakah sedang buka pada [now]?
 *
 * Mengembalikan `null` — bukan `false` — bila jam operasional tidak diketahui,
 * supaya UI bisa membedakan "tutup" dari "belum diisi".
 */
export function isOpenNow(
  operatingHours: unknown,
  now: Date = new Date(),
): boolean | null {
  if (!operatingHours || typeof operatingHours !== 'object') return null;

  // Server bisa berjalan di zona waktu mana pun (Vercel = UTC), jadi waktu
  // lokal koperasi dihitung eksplisit, bukan mengandalkan zona waktu proses.
  const wib = new Date(now.getTime() + WIB_OFFSET_MINUTES * 60_000);
  const dayKey = DAY_KEYS[wib.getUTCDay()];

  const today = (operatingHours as Record<string, unknown>)[dayKey];
  if (today === null || today === undefined) return false;
  if (typeof today !== 'object') return null;

  const { open, close } = today as Partial<DayHours>;
  if (typeof open !== 'string' || typeof close !== 'string') return null;

  const openMinutes = parseTime(open);
  const closeMinutes = parseTime(close);
  if (openMinutes === null || closeMinutes === null) return null;

  const nowMinutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();

  // Jam tutup yang lebih kecil dari jam buka berarti melewati tengah malam.
  if (closeMinutes <= openMinutes) {
    return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

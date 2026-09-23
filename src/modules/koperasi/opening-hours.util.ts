/**
 * Menentukan status buka/tutup dari kolom `operatingHours`.
 *
 * Bentuknya: `{ "mon": { "open": "07:00", "close": "17:00" }, "sun": null }`.
 * `null` atau hari yang tidak ada berarti tutup.
 *
 * Dihitung di server supaya semua klien sepakat, dan supaya `openNow` bisa
 * dipakai sebagai filter query.
 */

export const DAY_KEYS = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
] as const;

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

/**
 * Membersihkan `operatingHours` yang dikirim pengurus.
 *
 * Mengembalikan objek yang hanya berisi tujuh kunci hari yang dikenal, atau
 * melempar bila ada jam yang tidak bisa dibaca. Divalidasi di sini, bukan di
 * DTO: bentuknya objek bebas, dan class-validator hanya bisa memeriksa satu
 * field pada satu waktu.
 *
 * `null` pada sebuah hari berarti tutup. Hari yang dikirim sebagai objek
 * tanpa jam yang sah ditolak, bukan diam-diam dianggap tutup — pengurus akan
 * berpikir tokonya tampil buka padahal tidak.
 */
export function normalizeOperatingHours(
  value: unknown,
): Record<string, DayHours | null> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Jam operasional harus berupa objek per hari.');
  }

  const out: Record<string, DayHours | null> = {};
  for (const key of DAY_KEYS) {
    const day = (value as Record<string, unknown>)[key];
    if (day === null || day === undefined) {
      out[key] = null;
      continue;
    }
    if (typeof day !== 'object') {
      throw new Error(`Jam operasional hari ${key} tidak valid.`);
    }
    const { open, close } = day as Partial<DayHours>;
    if (
      typeof open !== 'string' ||
      typeof close !== 'string' ||
      parseTime(open) === null ||
      parseTime(close) === null
    ) {
      throw new Error(
        `Jam buka dan tutup hari ${key} harus berformat HH:MM.`,
      );
    }
    out[key] = { open: open.trim(), close: close.trim() };
  }
  return out;
}

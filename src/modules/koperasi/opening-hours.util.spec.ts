import { isOpenNow } from './opening-hours.util';

/** Membuat Date UTC yang setara dengan jam WIB tertentu pada hari tertentu. */
function wib(day: number, hour: number, minute = 0): Date {
  // 2026-09-06 adalah hari Minggu, jadi tanggal 6 + day memberi hari yang tepat.
  return new Date(Date.UTC(2026, 8, 6 + day, hour - 7, minute));
}

const JAM = {
  mon: { open: '07:00', close: '17:00' },
  sun: null,
};

describe('isOpenNow', () => {
  it('buka di dalam rentang jam', () => {
    expect(isOpenNow(JAM, wib(1, 10))).toBe(true);
  });

  it('tutup sebelum jam buka', () => {
    expect(isOpenNow(JAM, wib(1, 6, 59))).toBe(false);
  });

  it('tutup tepat pada jam tutup', () => {
    expect(isOpenNow(JAM, wib(1, 17))).toBe(false);
  });

  it('hari bernilai null berarti tutup', () => {
    expect(isOpenNow(JAM, wib(0, 10))).toBe(false);
  });

  it('hari yang tidak tercantum berarti tutup', () => {
    expect(isOpenNow(JAM, wib(6, 10))).toBe(false);
  });

  // Membedakan "tutup" dari "jamnya belum diisi" penting untuk UI.
  it('mengembalikan null bila jam operasional tidak diketahui', () => {
    expect(isOpenNow(null)).toBeNull();
    expect(isOpenNow(undefined)).toBeNull();
    expect(isOpenNow('bukan objek')).toBeNull();
  });

  it('mengembalikan null bila formatnya rusak', () => {
    expect(
      isOpenNow({ mon: { open: '25:00', close: '17:00' } }, wib(1, 10)),
    ).toBeNull();
    expect(
      isOpenNow({ mon: { open: 'pagi', close: 'sore' } }, wib(1, 10)),
    ).toBeNull();
  });

  it('menangani jam yang melewati tengah malam', () => {
    const malam = { mon: { open: '20:00', close: '02:00' } };
    expect(isOpenNow(malam, wib(1, 23))).toBe(true);
    expect(isOpenNow(malam, wib(1, 1))).toBe(true);
    expect(isOpenNow(malam, wib(1, 10))).toBe(false);
  });

  // Vercel berjalan di UTC; hasilnya harus tetap mengikuti WIB.
  it('memakai WIB, bukan zona waktu proses', () => {
    // 23:00 UTC Minggu = 06:00 WIB Senin → masih tutup (buka 07:00).
    expect(isOpenNow(JAM, new Date(Date.UTC(2026, 8, 6, 23, 0)))).toBe(false);
    // 01:00 UTC Senin = 08:00 WIB Senin → buka.
    expect(isOpenNow(JAM, new Date(Date.UTC(2026, 8, 7, 1, 0)))).toBe(true);
  });
});

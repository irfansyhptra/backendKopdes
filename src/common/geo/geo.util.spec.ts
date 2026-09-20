import {
  boundingBox,
  formatDistance,
  haversineMeters,
  isValidCoordinate,
  sortByDistance,
} from './geo.util';

// Desa Lamteh, Ulee Kareng, Banda Aceh.
const LAMTEH = { latitude: 5.5483, longitude: 95.3441 };

describe('haversineMeters', () => {
  it('jarak ke titik yang sama adalah nol', () => {
    expect(haversineMeters(LAMTEH, LAMTEH)).toBe(0);
  });

  it('menghitung jarak Banda Aceh - Medan dalam toleransi wajar', () => {
    const medan = { latitude: 3.5952, longitude: 98.6722 };
    const km = haversineMeters(LAMTEH, medan) / 1000;
    // Jarak garis lurus ±430 km.
    expect(km).toBeGreaterThan(400);
    expect(km).toBeLessThan(460);
  });

  it('simetris', () => {
    const b = { latitude: 5.55, longitude: 95.35 };
    expect(haversineMeters(LAMTEH, b)).toBeCloseTo(
      haversineMeters(b, LAMTEH),
      6,
    );
  });

  it('satu derajat lintang mendekati 111 km', () => {
    const utara = {
      latitude: LAMTEH.latitude + 1,
      longitude: LAMTEH.longitude,
    };
    const km = haversineMeters(LAMTEH, utara) / 1000;
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });
});

describe('boundingBox', () => {
  it('selalu menyelimuti lingkaran radiusnya', () => {
    const radiusKm = 10;
    const box = boundingBox(LAMTEH, radiusKm);

    // Titik tepat di tepi utara lingkaran harus berada di dalam kotak.
    const tepiUtara = {
      latitude: LAMTEH.latitude + radiusKm / 111.32,
      longitude: LAMTEH.longitude,
    };
    expect(tepiUtara.latitude).toBeLessThanOrEqual(box.maxLat);

    expect(box.minLat).toBeLessThan(LAMTEH.latitude);
    expect(box.maxLng).toBeGreaterThan(LAMTEH.longitude);
  });

  it('rentang bujur melebar mendekati kutub', () => {
    const khatulistiwa = boundingBox({ latitude: 0, longitude: 0 }, 10);
    const dekatKutub = boundingBox({ latitude: 80, longitude: 0 }, 10);

    const lebarKhatulistiwa = khatulistiwa.maxLng - khatulistiwa.minLng;
    const lebarKutub = dekatKutub.maxLng - dekatKutub.minLng;
    expect(lebarKutub).toBeGreaterThan(lebarKhatulistiwa);
  });

  it('tidak meledak jadi tak hingga di kutub', () => {
    const box = boundingBox({ latitude: 90, longitude: 0 }, 10);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
  });
});

describe('isValidCoordinate', () => {
  it('menerima koordinat yang sah', () => {
    expect(isValidCoordinate(LAMTEH)).toBe(true);
    expect(isValidCoordinate({ latitude: -90, longitude: 180 })).toBe(true);
  });

  it('menolak yang di luar rentang bumi', () => {
    expect(isValidCoordinate({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidCoordinate({ latitude: 0, longitude: 181 })).toBe(false);
  });

  it('menolak NaN dan Infinity', () => {
    expect(isValidCoordinate({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(isValidCoordinate({ latitude: 0, longitude: Infinity })).toBe(false);
  });
});

describe('formatDistance', () => {
  it('memakai meter di bawah 1 km', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('memakai koma sebagai pemisah desimal', () => {
    expect(formatDistance(1200)).toBe('1,2 km');
    expect(formatDistance(3400)).toBe('3,4 km');
  });

  it('membulatkan di atas 10 km', () => {
    expect(formatDistance(12_400)).toBe('12 km');
  });

  it('1000 m dibaca sebagai km, bukan 1000 m', () => {
    expect(formatDistance(1000)).toBe('1,0 km');
  });
});

describe('sortByDistance', () => {
  const dekat = { id: 'dekat', latitude: 5.549, longitude: 95.3445 };
  const jauh = { id: 'jauh', latitude: 5.6, longitude: 95.4 };
  const tanpaKoordinat = { id: 'kosong', latitude: null, longitude: null };

  it('mengurutkan dari yang terdekat', () => {
    const hasil = sortByDistance([jauh, dekat], LAMTEH, 50);
    expect(hasil.map((r) => r.id)).toEqual(['dekat', 'jauh']);
  });

  it('membuang entitas tanpa koordinat, bukan menganggapnya berjarak nol', () => {
    const hasil = sortByDistance([tanpaKoordinat, dekat], LAMTEH, 50);
    expect(hasil.map((r) => r.id)).toEqual(['dekat']);
  });

  it('membuang yang di luar radius', () => {
    const hasil = sortByDistance([dekat, jauh], LAMTEH, 1);
    expect(hasil.map((r) => r.id)).toEqual(['dekat']);
  });

  it('menyertakan jarak dalam meter dan labelnya', () => {
    const [hasil] = sortByDistance([dekat], LAMTEH, 50);
    expect(Number.isInteger(hasil.distanceMeters)).toBe(true);
    expect(hasil.distanceLabel).toMatch(/^\d+([,.]\d+)? (m|km)$/);
  });
});

/**
 * Perhitungan jarak untuk pencarian "terdekat".
 *
 * Database ini PostgreSQL tanpa PostGIS, jadi jarak dihitung dalam dua langkah:
 *
 * 1. **Bounding box** — menyaring kasar dengan `latitude BETWEEN ? AND ?` dan
 *    `longitude BETWEEN ? AND ?`, sehingga index `(latitude, longitude)`
 *    terpakai dan sebagian besar baris tersingkir tanpa perhitungan apa pun.
 * 2. **Haversine** — jarak lingkaran besar yang tepat, dihitung hanya pada
 *    baris yang lolos langkah 1, lalu diurutkan.
 *
 * Bounding box selalu mencakup lebih luas daripada lingkaran radius, jadi
 * langkah 1 tidak pernah membuang hasil yang seharusnya masuk.
 */

/** Jari-jari rata-rata bumi dalam meter. */
const EARTH_RADIUS_M = 6_371_000;

/** Batas atas radius pencarian. Melindungi dari query yang memindai semuanya. */
export const MAX_RADIUS_KM = 50;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Jarak lingkaran besar antara dua koordinat, dalam **meter**.
 */
export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Kotak pembatas yang menyelimuti lingkaran berjari-jari [radiusKm].
 *
 * Satu derajat bujur menyempit seiring mendekati kutub, jadi rentang bujur
 * dibagi `cos(lintang)`. Di dekat kutub pembaginya mendekati nol, sehingga
 * dibatasi agar tidak meledak menjadi tak hingga.
 */
export function boundingBox(
  center: Coordinates,
  radiusKm: number,
): BoundingBox {
  const latDelta = radiusKm / 111.32;

  const cosLat = Math.cos(toRadians(center.latitude));
  const lngDelta = radiusKm / (111.32 * Math.max(cosLat, 0.01));

  return {
    minLat: center.latitude - latDelta,
    maxLat: center.latitude + latDelta,
    minLng: center.longitude - lngDelta,
    maxLng: center.longitude + lngDelta,
  };
}

/** Koordinat yang berada di luar rentang bumi harus ditolak, bukan dijepit. */
export function isValidCoordinate(coords: Coordinates): boolean {
  const { latitude, longitude } = coords;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Format jarak untuk ditampilkan: `850 m`, `1,2 km`, `12 km`.
 *
 * Dihitung di server supaya seluruh klien menampilkan angka yang sama, dan
 * karena jarak yang dikirim frontend tidak pernah dipercaya.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  // Di bawah 10 km satu angka desimal masih berarti; di atas itu tidak.
  const value = km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km);
  return `${value} km`;
}

/**
 * Menyaring berdasarkan radius, menghitung jarak, lalu mengurutkan dari yang
 * terdekat. Entitas tanpa koordinat dibuang — bukan dianggap berjarak nol.
 */
export function sortByDistance<
  T extends { latitude: number | null; longitude: number | null },
>(
  items: T[],
  origin: Coordinates,
  radiusKm: number,
): Array<T & { distanceMeters: number; distanceLabel: string }> {
  const radiusMeters = radiusKm * 1000;

  return items
    .flatMap((item) => {
      if (item.latitude === null || item.longitude === null) return [];
      const distanceMeters = haversineMeters(origin, {
        latitude: item.latitude,
        longitude: item.longitude,
      });
      if (distanceMeters > radiusMeters) return [];
      return [
        {
          ...item,
          distanceMeters: Math.round(distanceMeters),
          distanceLabel: formatDistance(distanceMeters),
        },
      ];
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

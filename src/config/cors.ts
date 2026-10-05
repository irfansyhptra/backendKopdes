const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3100',
];

function wildcardMatches(origin: string, rule: string): boolean {
  if (!rule.startsWith('https://*.')) return false;
  const suffix = rule.slice('https://*'.length);
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith(suffix) &&
      url.hostname.length > suffix.length
    );
  } catch {
    return false;
  }
}

/**
 * Membuat pemeriksa CORS yang juga menerima klien non-browser tanpa Origin.
 * Daftar kosong hanya membuka localhost pada development dan menolak origin
 * browser pada production.
 */
export function corsOriginChecker(
  raw: string | undefined,
  production: boolean,
) {
  const allowed = (raw ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (!production) allowed.push(...LOCAL_ORIGINS);

  return (
    origin: string | undefined,
    callback: (error: Error | null, allowed?: boolean) => void,
  ) => {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    const accepted = allowed.some(
      (rule) => rule === normalized || wildcardMatches(normalized, rule),
    );
    callback(
      accepted ? null : new Error('Origin tidak diizinkan oleh CORS'),
      accepted,
    );
  };
}

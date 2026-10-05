import { corsOriginChecker } from './cors';

function check(
  checker: ReturnType<typeof corsOriginChecker>,
  origin?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    checker(origin, (_error, allowed) => resolve(Boolean(allowed)));
  });
}

describe('corsOriginChecker', () => {
  it('menerima origin eksplisit, preview Vercel, dan klien tanpa Origin', async () => {
    const checker = corsOriginChecker(
      'https://komit.id, https://*.vercel.app',
      true,
    );
    await expect(check(checker, 'https://komit.id')).resolves.toBe(true);
    await expect(check(checker, 'https://fitur-a.vercel.app')).resolves.toBe(
      true,
    );
    await expect(check(checker)).resolves.toBe(true);
  });

  it('menolak origin lain pada production', async () => {
    const checker = corsOriginChecker('https://komit.id', true);
    await expect(check(checker, 'https://contoh.invalid')).resolves.toBe(false);
  });
});

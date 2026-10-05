import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function controller(checks: {
  database: boolean;
  redis: boolean;
  storage: boolean;
  qdrant: boolean;
}) {
  const prisma = { $queryRaw: jest.fn(async () => checks.database) } as any;
  const cache = { checkHealth: jest.fn(async () => checks.redis) } as any;
  const storage = { checkHealth: jest.fn(async () => checks.storage) } as any;
  const qdrant = { checkHealth: jest.fn(async () => checks.qdrant) } as any;
  if (!checks.database)
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));
  return new HealthController(prisma, cache, storage, qdrant);
}

describe('HealthController readiness', () => {
  it('mengembalikan ok hanya saat seluruh dependency siap', async () => {
    await expect(
      controller({
        database: true,
        redis: true,
        storage: true,
        qdrant: true,
      }).ready(),
    ).resolves.toMatchObject({ status: 'ok', api: 'ok' });
  });

  it('menghasilkan 503 saat salah satu dependency gagal', async () => {
    await expect(
      controller({
        database: true,
        redis: true,
        storage: true,
        qdrant: false,
      }).ready(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

import 'reflect-metadata';

import { validate } from './env.validation';

/** Env minimum yang benar-benar dibutuhkan proses saat berjalan. */
const minimal = {
  DATABASE_URL: 'postgresql://u:p@host:5432/db',
  REDIS_URL: 'redis://host:6379',
  JWT_SECRET: 'secret',
  JWT_REFRESH_SECRET: 'secret',
  MINIO_ENDPOINT: 'host',
  MINIO_ACCESS_KEY: 'key',
  MINIO_SECRET_KEY: 'key',
  MINIO_BUCKET: 'bucket',
  QDRANT_URL: 'http://host:6333',
  GEMINI_API_KEY: 'key',
};

describe('validate env', () => {
  it('menerima env tanpa DIRECT_URL — hanya migrasi yang memakainya', () => {
    expect(() => validate(minimal)).not.toThrow();
  });

  it('tetap menolak env tanpa DATABASE_URL', () => {
    const tanpaDb = { ...minimal };
    delete (tanpaDb as Partial<typeof minimal>).DATABASE_URL;
    expect(() => validate(tanpaDb)).toThrow(/DATABASE_URL/);
  });
});

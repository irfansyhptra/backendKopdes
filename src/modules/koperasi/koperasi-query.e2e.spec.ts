import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { ConfigService } from '@nestjs/config';

import { KoperasiController } from './koperasi.controller';
import { KoperasiService } from './koperasi.service';
import { MitraController } from '../umkm/mitra.controller';
import { MitraService } from '../umkm/mitra.service';

/**
 * Kontrak query daftar Kopdes dan Mitra, lewat ValidationPipe yang sama
 * dengan main.ts.
 *
 * `forbidNonWhitelisted: true` berarti parameter yang tidak dikenal DTO
 * dijawab 400, bukan diabaikan. Itulah yang terjadi saat aplikasi mulai
 * mengirim `latitude`/`longitude` ke server yang DTO-nya belum mengenalnya:
 * seluruh daftar Kopdes gagal dimuat, bukan sekadar kehilangan urutannya.
 */
describe('GET /koperasi & /umkm — kontrak query', () => {
  let app: INestApplication<App>;
  const koperasi = { findAll: jest.fn(), findNearby: jest.fn() };
  const mitra = { findAll: jest.fn(), findNearby: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [KoperasiController, MitraController],
      providers: [
        { provide: KoperasiService, useValue: koperasi },
        { provide: MitraService, useValue: mitra },
        // Guard rute lain di controller yang sama ikut diinstansiasi,
        // meski rute yang diuji di sini publik.
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    koperasi.findAll.mockReset().mockResolvedValue({ koperasi: [] });
    mitra.findAll.mockReset().mockResolvedValue({ umkm: [] });
  });

  it('koordinat diterima dan sampai ke service sebagai angka', async () => {
    await request(app.getHttpServer())
      .get('/koperasi?page=1&limit=3&latitude=5.123456&longitude=97.123456')
      .expect(200);

    expect(koperasi.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 5.123456, longitude: 97.123456 }),
    );
  });

  it('tanpa koordinat tetap 200', async () => {
    await request(app.getHttpServer())
      .get('/koperasi?page=1&limit=3')
      .expect(200);
  });

  it('withProductsOnly diterima sebagai teks query', async () => {
    await request(app.getHttpServer())
      .get('/koperasi?withProductsOnly=true')
      .expect(200);

    expect(koperasi.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ withProductsOnly: true }),
    );
  });

  it('mitra menerima koordinat yang sama', async () => {
    await request(app.getHttpServer())
      .get('/umkm?page=1&limit=3&latitude=5.123456&longitude=97.123456')
      .expect(200);

    expect(mitra.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 5.123456, longitude: 97.123456 }),
    );
  });

  it('koordinat ngawur tetap ditolak', async () => {
    await request(app.getHttpServer())
      .get('/koperasi?latitude=91&longitude=0')
      .expect(400);
  });
});

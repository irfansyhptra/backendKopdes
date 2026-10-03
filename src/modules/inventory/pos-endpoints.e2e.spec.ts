import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { InventoryService } from './inventory.service';
import { SellerInventoryController } from './seller-inventory.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * Kontrak HTTP endpoint POS dan pemantauan, lewat ValidationPipe yang sama
 * dengan main.ts — `forbidNonWhitelisted: true`, yang menolak 400 untuk
 * parameter yang tidak dikenal DTO.
 */
describe('POST /seller/inventory/pos/movements & GET live', () => {
  let app: INestApplication<App>;
  const inventory = {
    recordPosMovementForSeller: jest.fn(),
    liveFeedForSeller: jest.fn(),
    listTransactionsForSeller: jest.fn(),
    adjustStockForSeller: jest.fn(),
    stockOpnameForSeller: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SellerInventoryController],
      providers: [
        { provide: InventoryService, useValue: inventory },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
      ],
    })
      // Guard dilewati: yang diuji di sini bentuk permintaannya, bukan auth.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { id: 'pemilik-1' };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
    jest.resetAllMocks();
    inventory.recordPosMovementForSeller.mockResolvedValue({
      duplicate: false,
      currentStock: 17,
    });
    inventory.liveFeedForSeller.mockResolvedValue({
      serverTime: '2026-10-03T10:00:00.000Z',
      hasMore: false,
      movements: [],
    });
  });

  const sale = {
    umkmProductId: 'p1',
    type: 'OUT',
    quantity: 3,
    reason: 'Penjualan kasir',
    externalRef: 'STRUK-001',
  };

  it('penjualan kasir diterima', async () => {
    const res = await request(app.getHttpServer())
      .post('/seller/inventory/pos/movements')
      .send(sale)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(inventory.recordPosMovementForSeller).toHaveBeenCalledWith(
      'pemilik-1',
      expect.objectContaining({ externalRef: 'STRUK-001', quantity: 3 }),
    );
  });

  // Tanpa nomor struk, kiriman ulang tidak bisa dikenali dan satu penjualan
  // memotong stok berkali-kali. Jadi wajib, bukan opsional.
  it('tanpa nomor struk ditolak', async () => {
    const { externalRef, ...tanpaRef } = sale;
    void externalRef;
    await request(app.getHttpServer())
      .post('/seller/inventory/pos/movements')
      .send(tanpaRef)
      .expect(400);
  });

  it('jumlah nol atau negatif ditolak', async () => {
    await request(app.getHttpServer())
      .post('/seller/inventory/pos/movements')
      .send({ ...sale, quantity: 0 })
      .expect(400);
  });

  it('kiriman ulang dijawab sukses dengan penanda duplikat', async () => {
    inventory.recordPosMovementForSeller.mockResolvedValue({
      duplicate: true,
      currentStock: 17,
    });

    const res = await request(app.getHttpServer())
      .post('/seller/inventory/pos/movements')
      .send(sale)
      .expect(201);

    expect(res.body.message).toContain('sudah tercatat');
  });

  it('umpan pemantauan menerima penanda ISO', async () => {
    await request(app.getHttpServer())
      .get('/seller/inventory/live?since=2026-10-03T09:00:00.000Z&limit=20')
      .expect(200);

    expect(inventory.liveFeedForSeller).toHaveBeenCalledWith(
      'pemilik-1',
      expect.objectContaining({
        since: '2026-10-03T09:00:00.000Z',
        limit: 20,
      }),
    );
  });

  it('umpan pemantauan tanpa penanda tetap sah', async () => {
    await request(app.getHttpServer())
      .get('/seller/inventory/live')
      .expect(200);
  });

  it('penanda yang bukan tanggal ditolak', async () => {
    await request(app.getHttpServer())
      .get('/seller/inventory/live?since=kemarin')
      .expect(400);
  });
});

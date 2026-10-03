import { Prisma } from '@prisma/client';

import { InventoryService } from './inventory.service';
import { PosMovementDto } from './dto/inventory.dto';

/**
 * Pergerakan stok dari kasir POS.
 *
 * Yang diuji terutama idempotensinya. Kasir di desa berjalan di atas jaringan
 * putus-nyambung: ia mengirim ulang permintaan yang jawabannya tidak pernah
 * sampai. Tanpa penjagaan, satu struk memotong stok berkali-kali dan catatan
 * sistem menjauh dari isi rak — persis hal yang fitur ini dibuat untuk cegah.
 */
describe('InventoryService — kasir POS', () => {
  const MY_UMKM = 'umkm-1';

  let prisma: any;
  let tx: any;
  let service: InventoryService;
  let stock: number;

  const sale = (externalRef = 'STRUK-001'): PosMovementDto =>
    ({
      umkmProductId: 'umkm-prod-1',
      type: 'OUT',
      quantity: 3,
      reason: 'Penjualan kasir',
      externalRef,
    }) as PosMovementDto;

  beforeEach(() => {
    stock = 20;

    tx = {
      product: { update: jest.fn() },
      uMKMProduct: {
        update: jest.fn(async (a: any) => {
          stock = a.data.stock;
          return { stock };
        }),
      },
      inventoryTransaction: {
        create: jest.fn(async (a: any) => ({ id: 'trx-1', ...a.data })),
      },
      auditLog: { create: jest.fn() },
    };

    prisma = {
      uMKMProduct: {
        findUnique: jest.fn(async () => ({
          id: 'umkm-prod-1',
          name: 'Keripik Pisang',
          stock,
          umkmId: MY_UMKM,
        })),
      },
      uMKM: { findUnique: jest.fn(async () => ({ id: MY_UMKM })) },
      inventoryTransaction: {
        findUnique: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    service = new InventoryService(prisma);
  });

  it('penjualan memotong stok dan mencatat nomor struknya', async () => {
    const result = await service.recordPosMovement('kasir-1', sale(), MY_UMKM);

    expect(stock).toBe(17);
    expect(result.duplicate).toBe(false);
    expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'OUT',
          quantity: 3,
          stockAfter: 17,
          externalRef: 'STRUK-001',
          userId: 'kasir-1',
        }),
      }),
    );
  });

  it('struk yang sama dikirim ulang TIDAK memotong stok dua kali', async () => {
    await service.recordPosMovement('kasir-1', sale(), MY_UMKM);
    expect(stock).toBe(17);

    // Kiriman kedua: catatannya sudah ada.
    prisma.inventoryTransaction.findUnique = jest.fn(async () => ({
      id: 'trx-1',
      quantity: 3,
      stockAfter: 17,
      umkmProduct: { id: 'umkm-prod-1', name: 'Keripik Pisang', stock: 17 },
      product: null,
    }));

    const replay = await service.recordPosMovement('kasir-1', sale(), MY_UMKM);

    expect(stock).toBe(17);
    expect(replay.duplicate).toBe(true);
    // Satu panggilan saja sejak awal — yang kedua tidak menyentuh database.
    expect(tx.uMKMProduct.update).toHaveBeenCalledTimes(1);
  });

  it('kiriman ulang dijawab sukses, bukan error', async () => {
    prisma.inventoryTransaction.findUnique = jest.fn(async () => ({
      id: 'trx-1',
      quantity: 3,
      stockAfter: 17,
      umkmProduct: { id: 'umkm-prod-1', name: 'Keripik Pisang', stock: 17 },
      product: null,
    }));

    // Kasir tidak punya cara membedakan "sudah masuk" dari "gagal"; menjawab
    // error akan membuatnya mencoba lagi selamanya.
    const result = await service.recordPosMovement('kasir-1', sale(), MY_UMKM);
    expect(result.duplicate).toBe(true);
    expect(result.currentStock).toBe(17);
  });

  it('dua kiriman berpacu: yang kalah membaca hasil yang menang', async () => {
    // Pemeriksaan awal kosong — keduanya lolos — lalu unique index menolak.
    let settled: any = null;
    prisma.inventoryTransaction.findUnique = jest.fn(async () => settled);
    prisma.$transaction = jest.fn(async () => {
      settled = {
        id: 'trx-1',
        quantity: 3,
        stockAfter: 17,
        umkmProduct: { id: 'umkm-prod-1', name: 'Keripik Pisang', stock: 17 },
        product: null,
      };
      throw new Prisma.PrismaClientKnownRequestError('duplikat', {
        code: 'P2002',
        clientVersion: 'test',
      });
    });

    const result = await service.recordPosMovement('kasir-1', sale(), MY_UMKM);
    expect(result.duplicate).toBe(true);
    expect(result.transaction.id).toBe('trx-1');
  });

  it('stok tidak cukup tetap ditolak, struk atau bukan', async () => {
    await expect(
      service.recordPosMovement(
        'kasir-1',
        { ...sale(), quantity: 999 } as PosMovementDto,
        MY_UMKM,
      ),
    ).rejects.toThrow(/tidak mencukupi/);
    expect(stock).toBe(20);
  });

  it('nomor struk tidak dibocorkan ke pergerakan manual', async () => {
    await service.adjustStock(
      'pemilik-1',
      {
        umkmProductId: 'umkm-prod-1',
        type: 'IN',
        quantity: 5,
        reason: 'Restok',
      } as any,
      MY_UMKM,
    );

    expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalRef: null }),
      }),
    );
  });
});

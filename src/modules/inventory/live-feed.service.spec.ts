import { InventoryService } from './inventory.service';

/**
 * Umpan pemantauan stok.
 *
 * Yang rawan di sini penandanya. Kalau penanda melompat melewati baris yang
 * belum terkirim, pergerakan itu hilang selamanya dari layar pemilik toko —
 * dan ia tidak akan pernah tahu ada yang hilang.
 */
describe('InventoryService — umpan pemantauan', () => {
  const MY_UMKM = 'umkm-1';

  let prisma: any;
  let service: InventoryService;
  let rows: any[];

  const movement = (id: string, at: string) => ({
    id,
    type: 'OUT',
    quantity: 1,
    stockAfter: 9,
    reason: 'Penjualan kasir',
    externalRef: `STRUK-${id}`,
    createdAt: new Date(at),
    user: { id: 'kasir-1', name: 'Kasir Toko' },
    product: null,
    umkmProduct: { id: 'p1', name: 'Keripik Pisang', stock: 9 },
  });

  beforeEach(() => {
    rows = [];
    prisma = {
      uMKM: { findUnique: jest.fn(async () => ({ id: MY_UMKM })) },
      inventoryTransaction: {
        findMany: jest.fn(async ({ take }: any) => rows.slice(0, take)),
      },
    };
    service = new InventoryService(prisma);
  });

  it('tanpa penanda: yang terbaru dulu', async () => {
    rows = [movement('b', '2026-10-03T10:00:00Z')];
    const feed = await service.liveFeed(MY_UMKM, null);

    expect(prisma.inventoryTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    expect(feed.movements[0].id).toBe('b');
  });

  it('dengan penanda: hanya yang lebih baru, urut kejadian', async () => {
    rows = [movement('a', '2026-10-03T10:00:00Z')];
    await service.liveFeed(MY_UMKM, null, '2026-10-03T09:00:00.000Z');

    const call = prisma.inventoryTransaction.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toEqual({
      gt: new Date('2026-10-03T09:00:00.000Z'),
    });
    // Menaik: klien menambahkannya ke ujung daftar sesuai urutan kejadian.
    expect(call.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('mitra hanya melihat pergerakan produknya sendiri', async () => {
    await service.liveFeed(MY_UMKM, null);
    const call = prisma.inventoryTransaction.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ umkmProduct: { umkmId: MY_UMKM } });
  });

  it('staf Kopdes melihat barang desanya, Kopdes maupun mitra', async () => {
    await service.liveFeed(null, 'kop-1');
    const call = prisma.inventoryTransaction.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { product: { kopdesId: 'kop-1' } },
      { umkmProduct: { umkm: { kopdesId: 'kop-1' } } },
    ]);
  });

  // Inilah penjaga terpentingnya.
  it('saat terpotong batas, penanda berhenti di baris terakhir yang dikirim', async () => {
    rows = [
      movement('a', '2026-10-03T10:00:00Z'),
      movement('b', '2026-10-03T10:00:01Z'),
      movement('c', '2026-10-03T10:00:02Z'),
    ];

    const feed = await service.liveFeed(
      MY_UMKM,
      null,
      '2026-10-03T09:00:00.000Z',
      2,
    );

    expect(feed.hasMore).toBe(true);
    expect(feed.movements.map((m) => m.id)).toEqual(['a', 'b']);
    // Maju ke 'b', BUKAN ke waktu server: 'c' belum terkirim dan harus
    // ikut pada permintaan berikutnya.
    expect(feed.serverTime).toBe(
      new Date('2026-10-03T10:00:01Z').toISOString(),
    );
  });

  it('tanpa sisa, penanda maju ke waktu server', async () => {
    rows = [movement('a', '2026-10-03T10:00:00Z')];
    const before = Date.now();
    const feed = await service.liveFeed(
      MY_UMKM,
      null,
      '2026-10-03T09:00:00.000Z',
    );

    expect(feed.hasMore).toBe(false);
    expect(new Date(feed.serverTime).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('nama produk dan pencatat ikut, supaya feednya terbaca', async () => {
    rows = [movement('a', '2026-10-03T10:00:00Z')];
    const feed = await service.liveFeed(MY_UMKM, null);
    const m = feed.movements[0];

    expect(m.product).toEqual({ id: 'p1', name: 'Keripik Pisang', stock: 9 });
    expect(m.recordedBy).toBe('Kasir Toko');
    expect(m.externalRef).toBe('STRUK-a');
  });

  it('batas dijepit, tidak bisa diminta ribuan sekaligus', async () => {
    await service.liveFeed(MY_UMKM, null, undefined, 10000);
    const call = prisma.inventoryTransaction.findMany.mock.calls[0][0];
    expect(call.take).toBe(201); // 200 + 1 penanda hasMore
  });
});

import { KoperasiService } from './koperasi.service';

/**
 * Daftar Kopdes untuk halaman warga.
 *
 * Yang dijaga di sini satu kalimat: daftar ini menampilkan SEMUA Kopdes
 * aktif. Koordinat hanya mengubah urutannya.
 *
 * Beranda dulu memakai endpoint `nearby` dengan radius 10 km, dan di
 * kabupaten yang desanya berjauhan itu berarti layar kosong — terbaca sebagai
 * "tidak ada Kopdes", bukan "tidak ada yang dekat".
 */

type Row = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  operatingHours: unknown;
};

const rows: Row[] = [
  // Banda Aceh, dekat titik acuan.
  {
    id: 'dekat',
    name: 'Kopdes Lamteh',
    latitude: 5.55,
    longitude: 95.32,
    operatingHours: null,
  },
  // Medan, ~550 km — jauh di luar radius 10 km lama.
  {
    id: 'jauh',
    name: 'Kopdes Medan',
    latitude: 3.59,
    longitude: 98.67,
    operatingHours: null,
  },
  // Belum mengisi koordinat sama sekali.
  {
    id: 'tanpa-titik',
    name: 'Kopdes Aceh Besar',
    latitude: null,
    longitude: null,
    operatingHours: null,
  },
];

function build() {
  const prisma = {
    koperasi: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
    review: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const service = new KoperasiService(prisma as never);
  return { service, prisma };
}

const origin = { latitude: 5.5483, longitude: 95.3238 };

describe('KoperasiService.findAll', () => {
  it('tanpa koordinat, seluruh Kopdes tetap tampil', async () => {
    const { service } = build();
    const result = await service.findAll({ page: 1, limit: 10 });
    expect(result.koperasi).toHaveLength(3);
  });

  it('dengan koordinat, yang jauh TIDAK dibuang — hanya diurutkan', async () => {
    const { service } = build();
    const result = await service.findAll({ page: 1, limit: 10, ...origin });

    expect(result.koperasi).toHaveLength(3);
    const ids = result.koperasi.map((k: { id: string }) => k.id);
    expect(ids[0]).toBe('dekat');
    expect(ids).toContain('jauh');
  });

  it('Kopdes tanpa koordinat ditaruh di belakang, bukan hilang', async () => {
    const { service } = build();
    const result = await service.findAll({ page: 1, limit: 10, ...origin });

    const ids = result.koperasi.map((k: { id: string }) => k.id);
    // Hilang di sini berarti satu Kopdes lenyap begitu izin lokasi diberikan,
    // lalu muncul lagi begitu ditolak.
    expect(ids).toContain('tanpa-titik');
    expect(ids[ids.length - 1]).toBe('tanpa-titik');
  });

  it('menyaring ke yang punya barang hanya bila diminta', async () => {
    const { service, prisma } = build();

    await service.findAll({ page: 1, limit: 10 });
    expect(prisma.koperasi.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'products',
    );

    await service.findAll({ page: 1, limit: 10, withProductsOnly: true });
    expect(prisma.koperasi.findMany.mock.calls[1][0].where).toHaveProperty(
      'products',
    );
  });
});

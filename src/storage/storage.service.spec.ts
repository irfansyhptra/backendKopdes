import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Unggahan Cloudinary.
 *
 * Spec lama menembak Supabase sungguhan lewat jaringan — lambat, dan
 * hijau-merahnya bergantung pada layanan pihak ketiga alih-alih pada kode
 * ini. Yang diuji sekarang logikanya sendiri: penolakan berkas, bentuk
 * permintaan, dan pembacaan public_id.
 */

const CONFIG: Record<string, string> = {
  CLOUDINARY_CLOUD_NAME: 'kopdes',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'rahasia',
};

function build(config: Record<string, string> = CONFIG) {
  const svc = new StorageService({
    get: (k: string) => config[k],
  } as never);
  return svc;
}

function file(name = 'a.png', type = 'image/png', bytes = 100) {
  return { buffer: Buffer.alloc(bytes), originalname: name, mimetype: type };
}

function okFetch() {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      secure_url: 'https://res.cloudinary.com/kopdes/image/upload/v1/kopdes/products/abc.png',
      url: 'http://res.cloudinary.com/kopdes/image/upload/v1/kopdes/products/abc.png',
    }),
  });
}

afterEach(() => {
  // @ts-expect-error dikembalikan ke bawaan runtime
  delete global.fetch;
});

describe('konfigurasi', () => {
  it('menolak unggahan bila kunci belum lengkap', async () => {
    const svc = build({});
    await expect(svc.uploadFile(file(), 'products')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('checkHealth false tanpa konfigurasi, tanpa menyentuh jaringan', async () => {
    const f = jest.fn();
    global.fetch = f as never;
    await expect(build({}).checkHealth()).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('penolakan berkas', () => {
  it('menolak jenis yang bukan gambar sebelum mengirim apa pun', async () => {
    const f = okFetch();
    global.fetch = f as never;
    await expect(
      build().uploadFile(file('x.pdf', 'application/pdf'), 'products'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f).not.toHaveBeenCalled();
  });

  it('menolak berkas di atas 4 MB sebelum mengirim apa pun', async () => {
    const f = okFetch();
    global.fetch = f as never;
    // Batas jalurnya, bukan batas Cloudinary: fungsi serverless Vercel
    // menolak badan permintaan di atas 4,5 MB.
    await expect(
      build().uploadFile(file('besar.png', 'image/png', 5 * 1024 * 1024), 'products'),
    ).rejects.toThrow(/lebih dari 4 MB/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('unggahan', () => {
  it('mengembalikan secure_url, bukan url http', async () => {
    global.fetch = okFetch() as never;
    const url = await build().uploadFile(file(), 'products');
    expect(url.startsWith('https://')).toBe(true);
  });

  it('menandatangani folder dan timestamp, dan tidak mengirim api_secret', async () => {
    const f = okFetch();
    global.fetch = f as never;
    await build().uploadFile(file(), 'products');

    const form = f.mock.calls[0][1].body as FormData;
    expect(form.get('folder')).toBe('kopdes/products');
    expect(form.get('api_key')).toBe('123456');
    expect(form.get('signature')).toEqual(expect.any(String));
    // Rahasianya dipakai menghitung tanda tangan, bukan dikirim.
    for (const [, v] of form.entries()) expect(String(v)).not.toBe('rahasia');
  });

  it('jaringan mati dijawab 503, bukan 400', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as never;
    // Penyimpanan tak terjangkau bukan kesalahan pengirim; 400 membuat
    // pegawai mengira formulirnya yang salah.
    await expect(build().uploadFile(file(), 'products')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('penolakan Cloudinary tidak membocorkan pesan mentahnya', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid Signature abc123' } }),
    }) as never;
    await expect(build().uploadFile(file(), 'products')).rejects.toThrow(
      /gagal diunggah ke penyimpanan/i,
    );
  });

  it('mengunggah berurutan, bukan serentak', async () => {
    let berjalan = 0;
    let puncak = 0;
    global.fetch = jest.fn(async () => {
      puncak = Math.max(puncak, ++berjalan);
      await new Promise((r) => setTimeout(r, 5));
      berjalan--;
      return {
        ok: true,
        status: 200,
        json: async () => ({ secure_url: 'https://res.cloudinary.com/x/a.png' }),
      };
    }) as never;

    await build().uploadMultipleFiles([file('a.png'), file('b.png'), file('c.png')], 'products');
    expect(puncak).toBe(1);
  });
});

describe('publicIdFromUrl', () => {
  it('membuang versi dan ekstensi, menyisakan folder', () => {
    expect(
      StorageService.publicIdFromUrl(
        'https://res.cloudinary.com/kopdes/image/upload/v1700000000/kopdes/products/abc.png',
      ),
    ).toBe('kopdes/products/abc');
  });

  it('bekerja tanpa segmen versi', () => {
    expect(
      StorageService.publicIdFromUrl(
        'https://res.cloudinary.com/kopdes/image/upload/kopdes/products/abc.webp',
      ),
    ).toBe('kopdes/products/abc');
  });

  it('URL yang bukan dari Cloudinary dijawab null', () => {
    expect(StorageService.publicIdFromUrl('https://contoh.test/a.png')).toBeNull();
  });
});

describe('penghapusan', () => {
  it('kegagalan hapus tidak dilempar — produk tetap boleh dihapus', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('mati')) as never;
    // Berkas yatim di Cloudinary tidak sebanding dengan menggagalkan
    // penghapusan produk yang sudah diminta pengguna.
    await expect(
      build().deleteFile('https://res.cloudinary.com/kopdes/image/upload/v1/a.png'),
    ).resolves.toBeUndefined();
  });
});

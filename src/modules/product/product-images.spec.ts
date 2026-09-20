import { ProductService } from './product.service';

/**
 * Gambar yang datang sebagai URL, bukan berkas.
 *
 * Klien mengunggah langsung ke Cloudinary lalu mengirim URL-nya; tidak ada
 * berkas yang melewati server. Yang diuji di sini adalah dua hal yang mudah
 * salah: penanda gambar utama, dan perbedaan antara "ganti daftar gambar"
 * dan "jangan sentuh gambar".
 */

/**
 * Keduanya private di service. Diuji lewat tipe terpisah karena keduanya
 * mengandung aturan yang mudah salah dan tidak punya endpoint sendiri —
 * membuatnya public hanya demi tes akan melebarkan permukaan kelasnya.
 */
interface Svc {
  attachImageUrls(id: string, urls?: string[], offset?: number): Promise<void>;
  ensurePrimaryImage(id: string): Promise<void>;
}

function build() {
  const productImage = {
    createMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  };
  const svc = Object.create(ProductService.prototype) as unknown as Svc;
  Object.assign(svc, { prisma: { productImage } });
  return { svc, productImage };
}

describe('attachImageUrls', () => {
  it('tidak menyentuh database bila tidak ada URL', async () => {
    const { svc, productImage } = build();
    await svc.attachImageUrls('p1', undefined);
    await svc.attachImageUrls('p1', []);
    expect(productImage.createMany).not.toHaveBeenCalled();
  });

  it('URL pertama menjadi gambar utama', async () => {
    const { svc, productImage } = build();
    await svc.attachImageUrls('p1', ['https://a/1.jpg', 'https://a/2.jpg']);
    const rows = productImage.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { isPrimary: boolean }) => r.isPrimary)).toEqual([true, false]);
  });

  it('tidak merebut penanda utama bila sudah ada gambar lain', async () => {
    const { svc, productImage } = build();
    // offset > 0 berarti sudah ada gambar duluan; dua gambar utama membuat
    // kartu produk menampilkan yang mana saja tergantung urutan query.
    await svc.attachImageUrls('p1', ['https://a/3.jpg'], 2);
    const rows = productImage.createMany.mock.calls[0][0].data;
    expect(rows[0].isPrimary).toBe(false);
  });
});

describe('ensurePrimaryImage', () => {
  it('diam bila sudah ada gambar utama', async () => {
    const { svc, productImage } = build();
    productImage.findFirst.mockResolvedValueOnce({ id: 'img1' });
    await svc.ensurePrimaryImage('p1');
    expect(productImage.update).not.toHaveBeenCalled();
  });

  it('mengangkat gambar tertua bila penanda utamanya ikut terhapus', async () => {
    const { svc, productImage } = build();
    productImage.findFirst
      .mockResolvedValueOnce(null) // tidak ada yang utama
      .mockResolvedValueOnce({ id: 'img2' }); // yang tertua
    await svc.ensurePrimaryImage('p1');
    expect(productImage.update).toHaveBeenCalledWith({
      where: { id: 'img2' },
      data: { isPrimary: true },
    });
  });

  it('produk tanpa gambar sama sekali tidak menimbulkan galat', async () => {
    const { svc, productImage } = build();
    productImage.findFirst.mockResolvedValue(null);
    await expect(svc.ensurePrimaryImage('p1')).resolves.toBeUndefined();
    expect(productImage.update).not.toHaveBeenCalled();
  });
});

import * as crypto from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Penyimpanan berkas di Cloudinary.
 *
 * Menggantikan Supabase Storage, yang proyeknya sudah tidak ada — hostname-nya
 * menjawab NXDOMAIN dan setiap unggahan gagal.
 *
 * Tanpa SDK: unggahan bertanda tangan hanyalah satu POST multipart dengan
 * SHA1 dari parameternya. Menambah dependensi beberapa megabyte ke fungsi
 * serverless untuk itu tidak sepadan.
 *
 * Bentuk metodenya dipertahankan sama seperti versi Supabase supaya
 * `ProductService` dan `SellerService` tidak ikut berubah. Bedanya satu:
 * `uploadFile` kini langsung mengembalikan URL https, sehingga
 * `getPublicUrl` tinggal meneruskannya.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly cloudName?: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;

  /** Prefiks folder di akun Cloudinary supaya berkas tidak tercecer. */
  private static readonly ROOT = 'kopdes';

  /**
   * Batas ukuran per berkas.
   *
   * Bukan batas Cloudinary melainkan batas jalurnya: fungsi serverless di
   * Vercel menolak badan permintaan di atas 4,5 MB, dan berkas di sini
   * melewatinya. Ditolak lebih awal dengan kalimat yang jelas lebih baik
   * daripada dijawab 413 tanpa keterangan oleh platform.
   */
  static readonly MAX_BYTES = 4 * 1024 * 1024;

  private static readonly ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  constructor(private readonly configService: ConfigService) {
    this.cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    this.apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    this.apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!this.isConfigured()) {
      // Peringatan saat start, bukan galat: sisa aplikasi tetap berguna
      // meski gambar tidak bisa diunggah.
      this.logger.warn(
        'Cloudinary belum dikonfigurasi — unggahan gambar akan ditolak.',
      );
    }
  }

  private isConfigured(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Penyimpanan gambar belum dikonfigurasi. Lengkapi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET.',
      );
    }
  }

  /**
   * Tanda tangan Cloudinary: parameter urut abjad, tanpa `api_key`, di-SHA1
   * bersama `api_secret`. Aturan mereka, bukan pilihan.
   */
  private sign(params: Record<string, string | number>): string {
    const base = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return crypto
      .createHash('sha1')
      .update(base + this.apiSecret)
      .digest('hex');
  }

  private folderFor(folder: string): string {
    const clean = folder.replace(/^\/+|\/+$/g, '');
    return clean ? `${StorageService.ROOT}/${clean}` : StorageService.ROOT;
  }

  /**
   * Mengunggah satu berkas dan mengembalikan URL https-nya.
   *
   * Versi Supabase mengembalikan "object key" yang baru menjadi URL lewat
   * `getPublicUrl`. Di sini URL-nya sudah final sejak awal; `getPublicUrl`
   * dipertahankan agar pemanggil lama tidak perlu diubah.
   */
  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
  ): Promise<string> {
    this.assertConfigured();

    if (!StorageService.ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Format "${file.originalname}" tidak didukung. Pakai JPG, PNG, atau WebP.`,
      );
    }
    if (file.buffer.length > StorageService.MAX_BYTES) {
      throw new BadRequestException(
        `"${file.originalname}" lebih dari 4 MB. Perkecil dulu gambarnya.`,
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const target = this.folderFor(folder);
    const signature = this.sign({ folder: target, timestamp });

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    form.append('api_key', this.apiKey!);
    form.append('timestamp', String(timestamp));
    form.append('folder', target);
    form.append('signature', signature);

    let res: Response;
    try {
      res = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
        { method: 'POST', body: form },
      );
    } catch (err) {
      // Penyimpanan tak terjangkau bukan kesalahan pengirim, jadi 503 —
      // bukan 400 seperti implementasi Supabase dulu, yang membuat pegawai
      // mengira formulirnya yang salah.
      this.logger.error(`Cloudinary tidak terjangkau: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Penyimpanan gambar sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.',
      );
    }

    const body = (await res.json().catch(() => null)) as {
      secure_url?: string;
      error?: { message?: string };
    } | null;

    if (!res.ok || !body?.secure_url) {
      const detail = body?.error?.message ?? `status ${res.status}`;
      this.logger.error(`Cloudinary menolak unggahan: ${detail}`);
      throw new ServiceUnavailableException(
        'Gambar gagal diunggah ke penyimpanan. Coba lagi beberapa saat lagi.',
      );
    }

    // secure_url, bukan url: yang kedua http dan akan ditolak halaman https
    // sebagai mixed content.
    return body.secure_url;
  }

  async uploadMultipleFiles(
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
    folder: string,
  ): Promise<string[]> {
    // Berurutan, bukan Promise.all: unggahan paralel dari fungsi serverless
    // memperbesar puncak memori dan tidak mempercepat apa pun bila jaringan
    // pengirimnya yang jadi hambatan.
    const urls: string[] = [];
    for (const file of files) {
      urls.push(await this.uploadFile(file, folder));
    }
    return urls;
  }

  /** URL sudah final sejak `uploadFile`; ada agar pemanggil lama tetap jalan. */
  getPublicUrl(objectKeyOrUrl: string): Promise<string> {
    return Promise.resolve(objectKeyOrUrl);
  }

  /**
   * `public_id` Cloudinary dari URL-nya.
   *
   * Bentuk URL: `…/upload/v<versi>/<public_id>.<ext>`. Bagian versi dan
   * ekstensi dibuang; sisanya termasuk foldernya adalah public_id.
   */
  static publicIdFromUrl(url: string): string | null {
    const marker = '/upload/';
    const at = url.indexOf(marker);
    if (at === -1) return null;
    let rest = url.slice(at + marker.length);
    rest = rest.replace(/^v\d+\//, '');
    const dot = rest.lastIndexOf('.');
    return dot === -1 ? rest : rest.slice(0, dot);
  }

  async deleteFile(objectKeyOrUrl: string): Promise<void> {
    if (!this.isConfigured()) return;

    const publicId =
      StorageService.publicIdFromUrl(objectKeyOrUrl) ?? objectKeyOrUrl;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ public_id: publicId, timestamp });

    const form = new FormData();
    form.append('public_id', publicId);
    form.append('api_key', this.apiKey!);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);

    try {
      await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`,
        { method: 'POST', body: form },
      );
    } catch (err) {
      // Berkas yatim di Cloudinary tidak sebanding dengan menggagalkan
      // penghapusan produk yang sudah diminta pengguna.
      this.logger.warn(`Gagal menghapus ${publicId}: ${String(err)}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = this.sign({ timestamp });
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/image?max_results=1`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${this.apiKey}:${this.apiSecret}`,
            ).toString('base64')}`,
            'X-Cld-Timestamp': String(timestamp),
            'X-Cld-Signature': signature,
          },
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

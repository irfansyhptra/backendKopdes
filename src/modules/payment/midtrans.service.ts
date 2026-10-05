import * as crypto from 'crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MidtransNotification,
  MidtransSnapResponse,
} from './midtrans.types';

/**
 * Klien Midtrans Snap.
 *
 * Modenya mengikuti `MIDTRANS_IS_PRODUCTION`. Sebelumnya nilai itu dibaca
 * lalu diabaikan — integrasinya dikunci ke Sandbox. Akibatnya kunci produksi
 * yang terpasang dikirim ke endpoint Sandbox, Midtrans menolaknya, dan
 * pembeli hanya melihat "server sedang bermasalah" tanpa petunjuk apa pun.
 *
 * Server Key hanya ada di sini. Ia tidak pernah dikirim ke klien, tidak
 * pernah masuk respons, dan tidak pernah dicetak ke log.
 */
@Injectable()
export class MidtransService {
  private readonly logger = new Logger(MidtransService.name);

  private readonly serverKey?: string;
  private readonly clientKey?: string;
  private readonly production: boolean;

  static readonly SNAP_API_SANDBOX =
    'https://app.sandbox.midtrans.com/snap/v1/transactions';
  static readonly SNAP_API_PRODUCTION =
    'https://app.midtrans.com/snap/v1/transactions';
  static readonly SNAP_JS_SANDBOX =
    'https://app.sandbox.midtrans.com/snap/snap.js';
  static readonly SNAP_JS_PRODUCTION =
    'https://app.midtrans.com/snap/snap.js';

  constructor(private readonly config: ConfigService) {
    this.serverKey = this.config.get<string>('MIDTRANS_SERVER_KEY');
    this.clientKey = this.config.get<string>('MIDTRANS_CLIENT_KEY');
    this.production =
      this.config.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';

    if (!this.serverKey || !this.clientKey) {
      this.logger.warn(
        'Kunci Midtrans belum lengkap — pembayaran online akan ditolak.',
      );
    } else if (this.keyModeMismatch()) {
      this.logger.error(
        `Kunci Midtrans tidak cocok dengan mode ${this.modeLabel()}. ` +
          'Pembayaran online akan ditolak sampai keduanya disamakan.',
      );
    }
  }

  get isProduction(): boolean {
    return this.production;
  }

  private modeLabel(): string {
    return this.production ? 'Produksi' : 'Sandbox';
  }

  /**
   * Apakah awalan kunci bertentangan dengan mode yang dipilih.
   *
   * Kunci Sandbox Midtrans berawalan `SB-`; kunci produksi tidak. Memakai
   * kunci produksi pada endpoint Sandbox (atau sebaliknya) hanya dijawab
   * 401 oleh Midtrans — pesan yang tidak memberi tahu apa pun kepada yang
   * memasangnya. Di sini ketidakcocokannya disebut terang-terangan.
   */
  private keyModeMismatch(): boolean {
    if (!this.serverKey) return false;
    const sandboxKey = this.serverKey.startsWith('SB-');
    return this.production ? sandboxKey : !sandboxKey;
  }

  /** Hanya untuk peringatan; penolakannya terjadi di `assertConfigured`. */
  suspiciousKeyPrefix(): boolean {
    return this.keyModeMismatch();
  }

  get snapApiUrl(): string {
    return this.production
      ? MidtransService.SNAP_API_PRODUCTION
      : MidtransService.SNAP_API_SANDBOX;
  }

  get snapJsUrl(): string {
    return this.production
      ? MidtransService.SNAP_JS_PRODUCTION
      : MidtransService.SNAP_JS_SANDBOX;
  }

  get publicClientKey(): string {
    this.assertConfigured();
    return this.clientKey!;
  }

  isConfigured(): boolean {
    return Boolean(this.serverKey && this.clientKey);
  }

  private assertConfigured() {
    if (!this.serverKey || !this.clientKey) {
      throw new ServiceUnavailableException(
        'Pembayaran online belum dikonfigurasi. Hubungi pengurus koperasi.',
      );
    }
    // Ditolak di sini, bukan dibiarkan jadi 401 dari Midtrans: yang membaca
    // pesan ini adalah orang yang bisa memperbaikinya.
    if (this.keyModeMismatch()) {
      throw new ServiceUnavailableException(
        this.production
          ? 'Mode pembayaran Produksi aktif, tetapi kunci Midtrans yang terpasang adalah kunci Sandbox. Pasang kunci Produksi, atau setel MIDTRANS_IS_PRODUCTION=false.'
          : 'Mode pembayaran Sandbox aktif, tetapi kunci Midtrans yang terpasang adalah kunci Produksi. Setel MIDTRANS_IS_PRODUCTION=true, atau pasang kunci Sandbox yang berawalan SB-.',
      );
    }
  }

  /** Basic auth Midtrans: server key sebagai username, sandi kosong. */
  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`;
  }

  private async request(
    payload: Record<string, unknown>,
  ): Promise<MidtransSnapResponse> {
    this.assertConfigured();

    let res: Response;
    try {
      res = await fetch(this.snapApiUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: this.authHeader(),
        },
        // Midtrans biasanya menjawab di bawah 3 detik; menunggu tanpa batas
        // membuat permintaan pengguna menggantung sampai gateway menyerah.
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown';
      this.logger.error(
        `Midtrans Snap ${this.modeLabel()} tidak terjangkau (${reason})`,
      );
      throw new ServiceUnavailableException(
        'Layanan pembayaran sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.',
      );
    }

    const body = (await res
      .json()
      .catch(() => null)) as MidtransSnapResponse | null;

    if (!body) {
      throw new ServiceUnavailableException(
        'Layanan pembayaran memberi jawaban yang tidak bisa dibaca.',
      );
    }

    if (!res.ok || !body.token || !body.redirect_url) {
      const reason = body.error_messages?.join(', ');
      throw new ServiceUnavailableException(
        reason || 'Midtrans Snap gagal membuat sesi pembayaran.',
      );
    }

    return body;
  }

  /**
   * Membuat token Snap. Pemilihan kanal pembayaran — QRIS, transfer bank,
   * dompet digital, kartu — berlangsung di popup resmi Midtrans, sehingga
   * backend tidak lagi memanggil Core Charge per kanal.
   */
  createSnapTransaction(
    payload: Record<string, unknown>,
  ): Promise<MidtransSnapResponse> {
    return this.request(payload);
  }

  /**
   * Memeriksa `signature_key` notifikasi.
   *
   * SHA512(order_id + status_code + gross_amount + server_key). Dibandingkan
   * dengan `timingSafeEqual` — perbandingan string biasa berhenti pada byte
   * pertama yang berbeda, dan selisih waktunya bisa dipakai menebak tanda
   * tangan huruf demi huruf.
   */
  verifySignature(notification: MidtransNotification): boolean {
    if (!this.serverKey) return false;

    const expected = crypto
      .createHash('sha512')
      .update(
        `${notification.order_id}${notification.status_code}${notification.gross_amount}${this.serverKey}`,
      )
      .digest('hex');

    const given = notification.signature_key ?? '';
    if (given.length !== expected.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(given, 'utf8'),
      Buffer.from(expected, 'utf8'),
    );
  }
}

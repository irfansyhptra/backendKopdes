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
 * Klien Midtrans Snap dalam mode Sandbox.
 *
 * Server Key hanya ada di sini. Ia tidak pernah dikirim ke klien, tidak
 * pernah masuk respons, dan tidak pernah dicetak ke log.
 */
@Injectable()
export class MidtransService {
  private readonly logger = new Logger(MidtransService.name);

  private readonly serverKey?: string;
  private readonly clientKey?: string;

  static readonly SNAP_API_URL =
    'https://app.sandbox.midtrans.com/snap/v1/transactions';
  static readonly SNAP_JS_URL = 'https://app.sandbox.midtrans.com/snap/snap.js';

  constructor(private readonly config: ConfigService) {
    this.serverKey = this.config.get<string>('MIDTRANS_SERVER_KEY');
    this.clientKey = this.config.get<string>('MIDTRANS_CLIENT_KEY');

    if (!this.serverKey || !this.clientKey) {
      this.logger.warn(
        'Kunci Midtrans Sandbox belum lengkap — pembayaran online akan ditolak.',
      );
    }
    if (this.config.get<string>('MIDTRANS_IS_PRODUCTION') === 'true') {
      this.logger.warn(
        'MIDTRANS_IS_PRODUCTION diabaikan: integrasi Snap masih dikunci ke Sandbox.',
      );
    }
  }

  /** Kunci Sandbox Midtrans **biasanya** berawalan `SB-`. */
  private hasSandboxPrefix(): boolean {
    return (this.serverKey ?? '').startsWith('SB-');
  }

  /**
   * Apakah awalan kuncinya tidak seperti biasanya untuk lingkungan ini.
   *
   * Hanya untuk peringatan. Tidak dipakai menolak permintaan — lihat alasan
   * di konstruktor.
   */
  suspiciousKeyPrefix(): boolean {
    if (!this.serverKey) return false;
    return !this.hasSandboxPrefix();
  }

  get snapJsUrl(): string {
    return MidtransService.SNAP_JS_URL;
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
      res = await fetch(MidtransService.SNAP_API_URL, {
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
      this.logger.error(`Midtrans Snap tidak terjangkau (${reason})`);
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
   * Membuat token Snap Sandbox. Pemilihan kanal pembayaran berlangsung di
   * popup resmi Midtrans sehingga backend tidak lagi memanggil Core Charge.
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

import * as crypto from 'crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MidtransChargeResponse,
  MidtransNotification,
} from './midtrans.types';

/**
 * Klien Midtrans Core API.
 *
 * Core API, bukan Snap: seluruh halaman pembayaran memakai tampilan aplikasi
 * sendiri, dan Snap memaksa halaman miliknya.
 *
 * Server Key hanya ada di sini. Ia tidak pernah dikirim ke klien, tidak
 * pernah masuk respons, dan tidak pernah dicetak ke log.
 */
@Injectable()
export class MidtransService {
  private readonly logger = new Logger(MidtransService.name);

  private readonly serverKey?: string;
  private readonly isProduction: boolean;

  static readonly SANDBOX_URL = 'https://api.sandbox.midtrans.com';
  static readonly PRODUCTION_URL = 'https://api.midtrans.com';

  constructor(private readonly config: ConfigService) {
    this.serverKey = this.config.get<string>('MIDTRANS_SERVER_KEY');
    this.isProduction =
      this.config.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';

    if (!this.serverKey) {
      this.logger.warn(
        'MIDTRANS_SERVER_KEY belum diisi — pembayaran online akan ditolak.',
      );
    } else if (this.mismatchedEnvironment()) {
      // Peringatan keras, bukan diam: kunci produksi yang dipakai menembak
      // sandbox hanya menghasilkan 401, dan sebaliknya kunci sandbox di
      // produksi berarti tidak ada uang yang benar-benar masuk.
      this.logger.error(
        `Kunci Midtrans tidak cocok dengan lingkungannya. ` +
          `MIDTRANS_IS_PRODUCTION=${this.isProduction}, tetapi kuncinya ` +
          `${this.isSandboxKey() ? 'kunci Sandbox (SB-)' : 'kunci Produksi'}.`,
      );
    }
  }

  /** Kunci sandbox Midtrans selalu berawalan `SB-`. */
  private isSandboxKey(): boolean {
    return (this.serverKey ?? '').startsWith('SB-');
  }

  mismatchedEnvironment(): boolean {
    if (!this.serverKey) return false;
    return this.isProduction === this.isSandboxKey();
  }

  get baseUrl(): string {
    return this.isProduction
      ? MidtransService.PRODUCTION_URL
      : MidtransService.SANDBOX_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.serverKey) && !this.mismatchedEnvironment();
  }

  private assertConfigured() {
    if (!this.serverKey) {
      throw new ServiceUnavailableException(
        'Pembayaran online belum dikonfigurasi. Hubungi pengurus koperasi.',
      );
    }
    if (this.mismatchedEnvironment()) {
      throw new ServiceUnavailableException(
        'Konfigurasi pembayaran tidak konsisten: kunci Midtrans tidak cocok ' +
          'dengan MIDTRANS_IS_PRODUCTION. Pembayaran dihentikan agar tidak ' +
          'ada transaksi yang salah lingkungan.',
      );
    }
  }

  /** Basic auth Midtrans: server key sebagai username, sandi kosong. */
  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`;
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<MidtransChargeResponse> {
    this.assertConfigured();

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: this.authHeader(),
          ...(init.headers ?? {}),
        },
        // Midtrans biasanya menjawab di bawah 3 detik; menunggu tanpa batas
        // membuat permintaan pengguna menggantung sampai gateway menyerah.
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown';
      this.logger.error(`Midtrans tidak terjangkau (${reason}) pada ${path}`);
      throw new ServiceUnavailableException(
        'Layanan pembayaran sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.',
      );
    }

    const body = (await res
      .json()
      .catch(() => null)) as MidtransChargeResponse | null;

    if (!body) {
      throw new ServiceUnavailableException(
        'Layanan pembayaran memberi jawaban yang tidak bisa dibaca.',
      );
    }

    return body;
  }

  /**
   * `POST /v2/charge` — membuat transaksi.
   *
   * Nominalnya sudah dihitung backend dari database; apa pun yang dikirim
   * klien tidak pernah sampai ke sini.
   */
  charge(payload: Record<string, unknown>): Promise<MidtransChargeResponse> {
    return this.request('/v2/charge', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /** `GET /v2/{order_id}/status` — status terkini menurut Midtrans. */
  status(midtransOrderId: string): Promise<MidtransChargeResponse> {
    return this.request(`/v2/${encodeURIComponent(midtransOrderId)}/status`, {
      method: 'GET',
    });
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

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class AuthEmailService {
  private readonly logger = new Logger(AuthEmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = Number(config.get<number>('SMTP_PORT') ?? 0);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = config.get<string>('SMTP_FROM') || user || '';
    this.transporter =
      host && port && user && pass
        ? nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
          })
        : null;
    if (!this.transporter || !this.from) {
      // Diumumkan sekali saat boot, bukan ditemukan oleh pendaftar pertama
      // yang gagal. Sejajar dengan peringatan mode kunci Midtrans.
      this.logger.error(
        'SMTP belum lengkap (butuh SMTP_HOST, SMTP_PORT, SMTP_USER, ' +
          'SMTP_PASS, SMTP_FROM). Pendaftaran pelanggan akan ditolak sampai ' +
          'keduanya diisi.',
      );
    }
  }

  async sendCustomerVerification(input: {
    email: string;
    name: string;
    code: string;
    expiresInMinutes: number;
  }) {
    if (!this.transporter || !this.from) {
      throw new ServiceUnavailableException(
        'Layanan email belum dikonfigurasi. Hubungi pengelola sistem.',
      );
    }

    const name = escapeHtml(input.name);
    const code = escapeHtml(input.code);

    try {
      await this.transporter.sendMail({
        from: `KMP Mitra <${this.from}>`,
        to: input.email,
        subject: `${input.code} adalah kode verifikasi KMP Mitra`,
        text:
          `Halo ${input.name},\n\nKode verifikasi KMP Mitra Anda adalah ${input.code}. ` +
          `Kode berlaku ${input.expiresInMinutes} menit. Jangan berikan kode ini kepada siapa pun.`,
        html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:auto;padding:28px;color:#1d1d1f">
          <div style="font-size:13px;font-weight:700;color:#d71932">KMP MITRA</div>
          <h1 style="font-size:24px;margin:18px 0 8px">Verifikasi email Anda</h1>
          <p style="line-height:1.6;color:#5f6368">Halo ${name}, gunakan kode berikut untuk menyelesaikan pendaftaran akun pelanggan.</p>
          <div style="margin:24px 0;padding:18px;border-radius:16px;background:#fff1f3;color:#b00020;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px">${code}</div>
          <p style="line-height:1.6;color:#5f6368">Kode berlaku selama ${input.expiresInMinutes} menit. Jangan berikan kode ini kepada siapa pun, termasuk petugas KMP Mitra.</p>
        </div>`,
      });
    } catch (error) {
      // Nodemailer melempar galat SMTP mentah — `EAUTH`, `ECONNECTION`,
      // `ETIMEDOUT`. Dibiarkan lolos, Nest menjawabnya 500 "Internal server
      // error" dan aplikasi menerjemahkannya menjadi "Server sedang
      // bermasalah", padahal seluruh server sehat dan yang salah hanya satu
      // kredensial. Sebab teknisnya masuk log untuk pengelola; pendaftar
      // hanya diberi langkah yang benar-benar bisa ia tempuh.
      const smtp = error as { code?: string; responseCode?: number };
      this.logger.error(
        `Pengiriman kode verifikasi gagal` +
          ` (${smtp.code ?? 'tanpa kode'}` +
          `${smtp.responseCode ? `/${smtp.responseCode}` : ''}): ` +
          `${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Kode verifikasi tidak bisa dikirim ke email Anda. Pengiriman email ' +
          'sedang tidak tersedia — coba lagi beberapa menit lagi, atau ' +
          'hubungi pengurus Kopdes desa Anda untuk didaftarkan.',
      );
    }
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );
}

import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

import { AuthEmailService } from './auth-email.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

const createTransport = nodemailer.createTransport as jest.Mock;

const SMTP_LENGKAP: Record<string, string> = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'noreply@contoh.id',
  SMTP_PASS: 'kata-sandi-aplikasi',
  SMTP_FROM: 'KMP Mitra <noreply@contoh.id>',
};

function config(values: Record<string, string> = SMTP_LENGKAP): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const kiriman = {
  email: 'warga@contoh.id',
  name: 'Warga Desa',
  code: '123456',
  expiresInMinutes: 10,
};

describe('AuthEmailService', () => {
  beforeEach(() => {
    createTransport.mockReset();
  });

  it('kegagalan SMTP menjadi 503 dengan langkah berikutnya, bukan 500 polos', async () => {
    // Nodemailer melempar galat SMTP mentah. Lolos tanpa ditangani, Nest
    // menjawab 500 dan aplikasi menampilkan "Server sedang bermasalah" —
    // pendaftar tidak pernah tahu bahwa yang salah hanya kredensial email.
    const eauth = Object.assign(
      new Error('Invalid login: 535-5.7.8 Username and Password not accepted'),
      { code: 'EAUTH', responseCode: 535 },
    );
    createTransport.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(eauth),
    });

    const service = new AuthEmailService(config());

    await expect(service.sendCustomerVerification(kiriman)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(service.sendCustomerVerification(kiriman)).rejects.toThrow(
      /hubungi pengurus Kopdes/i,
    );
  });

  it('tidak membocorkan isi galat SMTP ke pendaftar', async () => {
    createTransport.mockReturnValue({
      sendMail: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('535 BadCredentials gsmtp'), {
            code: 'EAUTH',
          }),
        ),
    });

    const service = new AuthEmailService(config());

    await expect(
      service.sendCustomerVerification(kiriman),
    ).rejects.not.toThrow(/BadCredentials|535/);
  });

  it('SMTP belum diisi tetap ditolak sebelum mencoba mengirim', async () => {
    const service = new AuthEmailService(config({ SMTP_PORT: '587' }));
    await expect(service.sendCustomerVerification(kiriman)).rejects.toThrow(
      /belum dikonfigurasi/i,
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('pengiriman berhasil tidak melempar apa pun', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    createTransport.mockReturnValue({ sendMail });

    const service = new AuthEmailService(config());
    await expect(
      service.sendCustomerVerification(kiriman),
    ).resolves.toBeUndefined();

    const dikirim = sendMail.mock.calls[0][0] as {
      to: string;
      subject: string;
    };
    expect(dikirim.to).toBe('warga@contoh.id');
    expect(dikirim.subject).toContain('123456');
  });
});

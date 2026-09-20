import * as crypto from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { MidtransService } from './midtrans.service';

/**
 * Klien Midtrans.
 *
 * Yang dijaga: kunci tidak pernah bocor, lingkungan tidak pernah tertukar,
 * dan tanda tangan webhook diperiksa dengan benar.
 */

const SANDBOX = {
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-rahasia',
  MIDTRANS_IS_PRODUCTION: 'false',
};

function build(config: Record<string, string> = SANDBOX) {
  return new MidtransService({ get: (k: string) => config[k] } as never);
}

afterEach(() => {
  // @ts-expect-error dikembalikan ke bawaan runtime
  delete global.fetch;
});

describe('lingkungan', () => {
  it('kunci sandbox + IS_PRODUCTION=false menembak sandbox', () => {
    const svc = build();
    expect(svc.baseUrl).toBe(MidtransService.SANDBOX_URL);
    expect(svc.isConfigured()).toBe(true);
  });

  it('kunci produksi dengan IS_PRODUCTION=false ditolak', async () => {
    // Kunci produksi menembak sandbox hanya menghasilkan 401 — dan yang lebih
    // berbahaya, kunci sandbox di produksi berarti tidak ada uang yang masuk.
    const svc = build({
      MIDTRANS_SERVER_KEY: 'Mid-server-produksi',
      MIDTRANS_IS_PRODUCTION: 'false',
    });
    expect(svc.mismatchedEnvironment()).toBe(true);
    expect(svc.isConfigured()).toBe(false);
    await expect(svc.charge({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('kunci sandbox dengan IS_PRODUCTION=true juga ditolak', async () => {
    const svc = build({
      MIDTRANS_SERVER_KEY: 'SB-Mid-server-rahasia',
      MIDTRANS_IS_PRODUCTION: 'true',
    });
    expect(svc.mismatchedEnvironment()).toBe(true);
    await expect(svc.charge({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('tanpa kunci, pembayaran ditolak dengan kalimat yang bisa dipahami', async () => {
    const svc = build({});
    await expect(svc.charge({})).rejects.toThrow(/belum dikonfigurasi/i);
  });
});

describe('permintaan', () => {
  it('memakai Basic auth dan tidak mengirim kunci di badan', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status_code: '201', status_message: 'ok' }),
    });
    global.fetch = fetchMock as never;

    await build().charge({ payment_type: 'qris' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${MidtransService.SANDBOX_URL}/v2/charge`);
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth.startsWith('Basic ')).toBe(true);
    // Kunci hanya boleh ada di header auth, tidak di badan permintaan.
    expect(String(init.body)).not.toContain('SB-Mid-server-rahasia');
  });

  it('gateway tak terjangkau dijawab 503, bukan galat mentah', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as never;
    await expect(build().charge({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('respons yang tidak bisa dibaca dijawab 503', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('bukan json');
      },
    }) as never;
    await expect(build().charge({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('memakai batas waktu, bukan menunggu tanpa akhir', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status_code: '201', status_message: 'ok' }),
    });
    global.fetch = fetchMock as never;
    await build().status('KOMIT-1-2');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('verifySignature', () => {
  const key = 'SB-Mid-server-rahasia';

  function sign(orderId: string, statusCode: string, gross: string) {
    return crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${gross}${key}`)
      .digest('hex');
  }

  const base = {
    order_id: 'KOMIT-abc-1700000000',
    status_code: '200',
    gross_amount: '50000.00',
    transaction_id: 't1',
    transaction_status: 'settlement',
  };

  it('menerima tanda tangan yang benar', () => {
    const svc = build();
    expect(
      svc.verifySignature({
        ...base,
        signature_key: sign(base.order_id, base.status_code, base.gross_amount),
      }),
    ).toBe(true);
  });

  it('menolak tanda tangan yang salah', () => {
    const svc = build();
    expect(
      svc.verifySignature({ ...base, signature_key: 'a'.repeat(128) }),
    ).toBe(false);
  });

  it('menolak tanda tangan kosong atau panjangnya berbeda', () => {
    const svc = build();
    expect(svc.verifySignature({ ...base, signature_key: '' })).toBe(false);
    expect(svc.verifySignature({ ...base, signature_key: 'pendek' })).toBe(false);
  });

  it('nominal yang diubah membuat tanda tangan tidak cocok', () => {
    const svc = build();
    const signature = sign(base.order_id, base.status_code, '50000.00');
    // Penyerang yang menaikkan nominal tanpa kunci server tidak bisa
    // menghitung ulang tanda tangannya.
    expect(
      svc.verifySignature({ ...base, gross_amount: '1.00', signature_key: signature }),
    ).toBe(false);
  });

  it('tanpa kunci server, tidak ada tanda tangan yang diterima', () => {
    expect(
      build({}).verifySignature({ ...base, signature_key: 'apa pun' }),
    ).toBe(false);
  });
});

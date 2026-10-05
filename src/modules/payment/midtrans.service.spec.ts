import * as crypto from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { MidtransService } from './midtrans.service';

const SANDBOX = {
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-rahasia',
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client-publik',
  MIDTRANS_IS_PRODUCTION: 'false',
};

const PRODUCTION = {
  MIDTRANS_SERVER_KEY: 'Mid-server-rahasia',
  MIDTRANS_CLIENT_KEY: 'Mid-client-publik',
  MIDTRANS_IS_PRODUCTION: 'true',
};

function build(config: Record<string, string> = SANDBOX) {
  return new MidtransService({ get: (key: string) => config[key] } as never);
}

afterEach(() => {
  // @ts-expect-error mengembalikan fetch ke bawaan runtime pengujian
  delete global.fetch;
});

describe('Midtrans Snap', () => {
  it('mode sandbox memakai alamat sandbox', () => {
    const service = build();
    expect(service.isProduction).toBe(false);
    expect(service.snapJsUrl).toBe(MidtransService.SNAP_JS_SANDBOX);
    expect(service.snapApiUrl).toBe(MidtransService.SNAP_API_SANDBOX);
    expect(service.publicClientKey).toBe(SANDBOX.MIDTRANS_CLIENT_KEY);
  });

  it('mode produksi memakai alamat produksi, bukan sandbox', () => {
    const service = build(PRODUCTION);
    expect(service.isProduction).toBe(true);
    expect(service.snapJsUrl).toBe(MidtransService.SNAP_JS_PRODUCTION);
    expect(service.snapApiUrl).toBe(MidtransService.SNAP_API_PRODUCTION);
    expect(service.snapApiUrl).not.toContain('sandbox');
  });

  // Inilah yang membuat pembeli hanya melihat "server sedang bermasalah":
  // kunci produksi dikirim ke endpoint sandbox, Midtrans menjawab 401, dan
  // tidak ada satu pun pesan yang menyebut sebabnya.
  it('kunci produksi pada mode sandbox ditolak dengan sebab yang jelas', async () => {
    const service = build({ ...PRODUCTION, MIDTRANS_IS_PRODUCTION: 'false' });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await expect(service.createSnapTransaction({})).rejects.toThrow(
      /kunci Midtrans yang terpasang adalah kunci Produksi/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kunci sandbox pada mode produksi ditolak dengan sebab yang jelas', async () => {
    const service = build({ ...SANDBOX, MIDTRANS_IS_PRODUCTION: 'true' });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await expect(service.createSnapTransaction({})).rejects.toThrow(
      /kunci Midtrans yang terpasang adalah kunci Sandbox/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('membuat token lewat endpoint Snap sandbox dan Basic auth', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'snap-token',
        redirect_url: 'https://app.sandbox.midtrans.com/snap/v3/redirection/x',
      }),
    });
    global.fetch = fetchMock as never;

    const payload = {
      transaction_details: { order_id: 'KOMIT-1', gross_amount: 50000 },
    };
    await expect(build().createSnapTransaction(payload)).resolves.toMatchObject(
      {
        token: 'snap-token',
      },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(MidtransService.SNAP_API_SANDBOX);
    expect(String(url)).not.toContain('/v2/charge');
    expect((init.headers as Record<string, string>).Authorization).toMatch(
      /^Basic /,
    );
    expect(String(init.body)).not.toContain(SANDBOX.MIDTRANS_SERVER_KEY);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('menolak bila salah satu kunci sandbox belum tersedia', async () => {
    const service = build({
      MIDTRANS_SERVER_KEY: SANDBOX.MIDTRANS_SERVER_KEY,
    });
    await expect(service.createSnapTransaction({})).rejects.toThrow(
      /belum dikonfigurasi/i,
    );
  });

  it('gateway tidak terjangkau dijawab sebagai 503', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('fetch failed')) as never;
    await expect(build().createSnapTransaction({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('respons Snap tanpa token ditolak', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error_messages: ['invalid payload'] }),
    }) as never;
    await expect(build().createSnapTransaction({})).rejects.toThrow(
      /invalid payload/i,
    );
  });
});

describe('verifySignature', () => {
  const key = SANDBOX.MIDTRANS_SERVER_KEY;
  const base = {
    order_id: 'KOMIT-abc-1700000000',
    status_code: '200',
    gross_amount: '50000.00',
    transaction_id: 't1',
    transaction_status: 'settlement',
  };

  const sign = (gross: string) =>
    crypto
      .createHash('sha512')
      .update(`${base.order_id}${base.status_code}${gross}${key}`)
      .digest('hex');

  it('menerima tanda tangan benar dan menolak nominal yang diubah', () => {
    const service = build();
    expect(
      service.verifySignature({
        ...base,
        signature_key: sign(base.gross_amount),
      }),
    ).toBe(true);
    expect(
      service.verifySignature({
        ...base,
        gross_amount: '1.00',
        signature_key: sign(base.gross_amount),
      }),
    ).toBe(false);
  });

  it('menolak tanda tangan kosong, salah, atau tanpa server key', () => {
    const service = build();
    expect(service.verifySignature({ ...base, signature_key: '' })).toBe(false);
    expect(service.verifySignature({ ...base, signature_key: 'pendek' })).toBe(
      false,
    );
    expect(
      build({ MIDTRANS_CLIENT_KEY: 'client' }).verifySignature({
        ...base,
        signature_key: 'apa pun',
      }),
    ).toBe(false);
  });
});

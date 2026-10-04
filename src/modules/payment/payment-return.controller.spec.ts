import { PaymentReturnController } from './payment-return.controller';
import { chargePayloadFor, paymentReturnUrl } from './midtrans.types';

describe('PaymentReturnController', () => {
  const c = new PaymentReturnController();

  it('tidak mencetak teks mentah dari URL ke HTML', () => {
    const html = c.success('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert');
    expect(c.success('KOMIT-abc-123')).toContain('KOMIT-abc-123');
  });

  it('halaman gagal & tertunda memberi langkah berikutnya', () => {
    expect(c.failed()).toContain('Bayar Ulang');
    expect(c.pending()).toContain('belum kami terima');
  });

  it('GoPay & ShopeePay dikembalikan ke halaman sukses', () => {
    const gopay = chargePayloadFor('GOPAY') as any;
    const spay = chargePayloadFor('SHOPEEPAY') as any;
    expect(gopay.gopay.callback_url).toBe(paymentReturnUrl('success'));
    expect(spay.shopeepay.callback_url).toBe(paymentReturnUrl('success'));
    expect(paymentReturnUrl('failed')).toMatch(
      /\/api\/v1\/payments\/return\/failed$/,
    );
  });
});

import { WalletService } from './wallet.service';

/**
 * Aturan uang yang tidak boleh berubah diam-diam.
 *
 * Yang diuji di sini murni logika tanpa database: penamaan `order_id`,
 * pengenalannya kembali, dan batas nominal. Perilaku buku besarnya sendiri
 * (kunci baris, saldo negatif, idempotensi) dijaga oleh constraint database
 * dan diuji lewat probe terhadap server yang berjalan — mock Prisma tidak
 * akan membuktikan apa pun tentang `FOR UPDATE` maupun unique index.
 */

describe('penamaan transaksi isi ulang', () => {
  it('memakai awalan TOPUP supaya bisa dibedakan dari pesanan', () => {
    const id = WalletService.buildMidtransOrderId(
      'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      1_700_000_000_000,
    );
    expect(id.startsWith('TOPUP-')).toBe(true);
    expect(WalletService.isTopUpOrderId(id)).toBe(true);
  });

  it('tidak mengira order pesanan sebagai isi ulang', () => {
    // Webhook yang salah rute akan mengkredit saldo untuk pembayaran pesanan.
    expect(WalletService.isTopUpOrderId('KOMIT-abc123-1700000000')).toBe(false);
    expect(WalletService.isTopUpOrderId('')).toBe(false);
  });

  it('tetap di bawah batas 50 karakter Midtrans', () => {
    const id = WalletService.buildMidtransOrderId(
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      9_999_999_999_000,
    );
    expect(id.length).toBeLessThanOrEqual(50);
  });

  it('dua isi ulang berbeda tidak pernah bernama sama', () => {
    const a = WalletService.buildMidtransOrderId(
      'aaaaaaaa-1111',
      1_700_000_000_000,
    );
    const b = WalletService.buildMidtransOrderId(
      'bbbbbbbb-2222',
      1_700_000_000_000,
    );
    expect(a).not.toBe(b);
  });
});

describe('batas nominal isi ulang', () => {
  it('batas bawah ada supaya biaya transaksi tidak melampaui isinya', () => {
    expect(WalletService.MIN_TOPUP).toBeGreaterThan(0);
  });

  it('batas atas ada sebagai penjaga salah ketik', () => {
    // Tanpa batas atas, satu nol berlebih menagih warga 10x lipat.
    expect(WalletService.MAX_TOPUP).toBeGreaterThan(WalletService.MIN_TOPUP);
    expect(WalletService.MAX_TOPUP).toBeLessThanOrEqual(100_000_000);
  });
});

import { Controller, Get, Header, Query } from '@nestjs/common';

/**
 * Halaman tujuan setelah pembeli selesai di halaman/aplikasi pembayaran
 * (GoPay, ShopeePay, dan "Finish/Unfinish/Error Redirect URL" di dashboard
 * Midtrans).
 *
 * Halaman ini TIDAK menentukan lunas-tidaknya pesanan. Parameter di URL
 * (`transaction_status`, `status_code`) bisa diketik siapa saja; yang
 * mengubah status pesanan hanya webhook bertanda tangan di
 * `POST /payments/midtrans/webhook`. Di sini cukup memberi tahu langkah
 * berikutnya: kembali ke aplikasi, yang memeriksa statusnya sendiri.
 */
@Controller('payments/return')
export class PaymentReturnController {
  @Get('success')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  success(@Query('order_id') orderId?: string) {
    return page({
      title: 'Pembayaran sedang dikonfirmasi',
      body:
        'Terima kasih. Midtrans sedang meneruskan pembayaran Anda ke KOMIT. ' +
        'Kembali ke aplikasi — status pesanan berubah menjadi "Dibayar" ' +
        'dalam beberapa detik.',
      orderId,
      tone: 'ok',
    });
  }

  @Get('pending')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  pending(@Query('order_id') orderId?: string) {
    return page({
      title: 'Pembayaran belum selesai',
      body:
        'Pembayaran Anda belum kami terima. Selesaikan pembayaran sebelum ' +
        'batas waktunya, lalu kembali ke aplikasi KOMIT untuk melihat ' +
        'statusnya.',
      orderId,
      tone: 'wait',
    });
  }

  @Get('failed')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  failed(@Query('order_id') orderId?: string) {
    return page({
      title: 'Pembayaran gagal',
      body:
        'Pembayaran tidak berhasil dan saldo Anda tidak terpotong. Kembali ' +
        'ke aplikasi KOMIT, buka pesanan Anda, lalu pilih "Bayar Ulang" atau ' +
        'metode pembayaran lain.',
      orderId,
      tone: 'fail',
    });
  }
}

/** Nomor pesanan Midtrans kita: KOMIT-{uuid}-{waktu} / TOPUP-… */
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

function page(p: {
  title: string;
  body: string;
  orderId?: string;
  tone: 'ok' | 'wait' | 'fail';
}) {
  const color = { ok: '#1E7B34', wait: '#9A5B00', fail: '#C13515' }[p.tone];
  // Hanya id yang lolos pola yang ditampilkan — tidak ada teks dari URL
  // yang dicetak mentah ke HTML.
  const ref =
    p.orderId && SAFE_ID.test(p.orderId)
      ? `<p class="ref">Nomor transaksi: <b>${p.orderId}</b></p>`
      : '';
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.title} · KOMIT</title>
<style>
body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F5F5F7;color:#1D1D1F;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{background:#fff;border:1px solid #E8E8ED;border-radius:20px;padding:28px 24px;max-width:420px;width:100%}
h1{font-size:22px;margin:0 0 8px;color:${color}}
p{margin:0 0 12px;color:#424245}.ref{font-size:14px;color:#6E6E73;word-break:break-all}
.brand{font-weight:800;color:#C9141C;letter-spacing:.02em;margin-bottom:16px}
</style></head><body><main>
<div class="brand">KOMIT</div>
<h1>${p.title}</h1>
<p>${p.body}</p>${ref}
<p class="ref">Halaman ini boleh ditutup.</p>
</main></body></html>`;
}

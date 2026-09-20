import { Prisma } from '@prisma/client';
import {
  composeOrderTotals,
  resolveDiscount,
  resolveShippingFee,
} from './order-money';

const d = (v: string | number) => new Prisma.Decimal(v);

describe('composeOrderTotals', () => {
  it('total = subtotal + ongkir - diskon', () => {
    const t = composeOrderTotals(d('116000'), {
      shippingFee: d('8000'),
      discountAmount: d('5000'),
    });
    expect(t.totalAmount.toString()).toBe('119000');
    expect(t.subtotal.toString()).toBe('116000');
  });

  it('tanpa ongkir dan diskon, total sama dengan subtotal', () => {
    const t = composeOrderTotals(d('64000'));
    expect(t.totalAmount.toString()).toBe('64000');
    expect(t.shippingFee.toString()).toBe('0');
    expect(t.discountAmount.toString()).toBe('0');
  });

  it('diskon tidak boleh membuat total negatif', () => {
    const t = composeOrderTotals(d('20000'), {
      discountAmount: d('50000'),
    });
    // Diskon dipotong sampai nilai barang, bukan dibiarkan melewatinya.
    expect(t.discountAmount.toString()).toBe('20000');
    expect(t.totalAmount.toString()).toBe('0');
  });

  it('diskon yang dipotong tetap menyisakan ongkir yang ditagihkan', () => {
    const t = composeOrderTotals(d('20000'), {
      shippingFee: d('9000'),
      discountAmount: d('50000'),
    });
    expect(t.totalAmount.toString()).toBe('9000');
  });

  it('pecahan rupiah tidak hilang', () => {
    const t = composeOrderTotals(d('1234.56'), {
      shippingFee: d('0.44'),
    });
    expect(t.totalAmount.toString()).toBe('1235');
  });

  it('nominal besar tetap eksak', () => {
    // Sebagai double, angka ini sudah tidak bisa dijumlahkan dengan tepat.
    const t = composeOrderTotals(d('98765432109.99'), {
      shippingFee: d('0.01'),
    });
    expect(t.totalAmount.toString()).toBe('98765432110');
  });
});

describe('tarif bawaan', () => {
  it('ongkir dan diskon nol sampai kebijakannya diputuskan', () => {
    expect(resolveShippingFee().toString()).toBe('0');
    expect(resolveDiscount().toString()).toBe('0');
  });
});

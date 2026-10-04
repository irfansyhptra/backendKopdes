import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSellerProductDto } from './create-seller-product.dto';

// Bentuk yang dikirim aplikasi: multipart, jadi semua angka berupa teks.
const errorsOf = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(CreateSellerProductDto, {
    name: 'Kopi Arabika Gayo 250 g',
    price: '65000',
    stock: '10',
    categoryId: 'cat-1',
    ...body,
  });
  return (await validate(dto)).map((e) => e.property);
};

describe('CreateSellerProductDto', () => {
  it('deskripsi boleh kosong', async () => {
    expect(await errorsOf({})).toEqual([]);
    expect(await errorsOf({ description: '' })).toEqual([]);
  });

  it('menolak harga 0, stok negatif, dan stok pecahan', async () => {
    expect(await errorsOf({ price: '0' })).toEqual(['price']);
    expect(await errorsOf({ stock: '-1' })).toEqual(['stock']);
    expect(await errorsOf({ stock: '1.5' })).toEqual(['stock']);
  });

  it('nama dipangkas sebelum diukur, deskripsi maks 500', async () => {
    expect(await errorsOf({ name: '  ab  ' })).toEqual(['name']);
    expect(await errorsOf({ description: 'x'.repeat(501) })).toEqual([
      'description',
    ]);
  });
});

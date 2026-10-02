import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { KoperasiQueryDto } from './dto/koperasi-query.dto';

/// Query string selalu tiba sebagai teks — itu yang diuji di sini.
function check(raw: Record<string, unknown>) {
  const dto = plainToInstance(KoperasiQueryDto, raw);
  return validateSync(dto as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((e) => ({ property: e.property, constraints: e.constraints }));
}

describe('KoperasiQueryDto', () => {
  it('tanpa koordinat', () => {
    expect(check({ page: '1', limit: '3' })).toEqual([]);
  });

  it('dengan koordinat sebagai teks', () => {
    expect(
      check({
        page: '1',
        limit: '3',
        latitude: '5.123456',
        longitude: '97.123456',
      }),
    ).toEqual([]);
  });

  it('dengan withProductsOnly', () => {
    expect(check({ withProductsOnly: 'true' })).toEqual([]);
  });

  it('koordinat di luar jangkauan ditolak', () => {
    expect(check({ latitude: '91', longitude: '0' })).not.toEqual([]);
  });
});

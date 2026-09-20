import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  percentChange,
  periodRanges,
  StaffService,
  StaffUser,
  todayHours,
  withinHours,
} from './staff.service';

const staff = (over: Partial<StaffUser> = {}): StaffUser => ({
  id: 'u1',
  role: Role.PEGAWAI_KOPDES,
  kopdesId: 'kop-1',
  permissions: [],
  ...over,
});

describe('StaffService.resolveScope', () => {
  const service = new StaffService({} as never);

  it('mengunci pegawai pada Kopdes penugasannya', () => {
    expect(service.resolveScope(staff())).toBe('kop-1');
  });

  it('menolak pegawai yang meminta Kopdes lain', () => {
    expect(() => service.resolveScope(staff(), 'kop-2')).toThrow(
      ForbiddenException,
    );
  });

  it('menolak staf tanpa penugasan, bukan memberinya akses penuh', () => {
    expect(() => service.resolveScope(staff({ kopdesId: null }))).toThrow(
      ForbiddenException,
    );
  });

  it('Super Admin boleh lintas desa', () => {
    const su = staff({ role: Role.SUPER_ADMIN, kopdesId: null });
    expect(service.resolveScope(su)).toBeNull();
    expect(service.resolveScope(su, 'kop-9')).toBe('kop-9');
  });
});

describe('percentChange', () => {
  it('menghitung kenaikan terhadap periode sebelumnya', () => {
    expect(percentChange('112', '100')).toBe(12);
    expect(percentChange('80', '100')).toBe(-20);
  });

  it('tidak membagi nol saat kemarin tidak ada penjualan', () => {
    expect(percentChange('150000', '0.00')).toBeNull();
  });
});

describe('periodRanges', () => {
  it('hari ini mencakup satu hari penuh dan dibandingkan dengan kemarin', () => {
    const now = new Date('2026-09-07T15:30:00');
    const { current, previous } = periodRanges('today', now);
    expect(current.gte.getDate()).toBe(7);
    expect(current.lt.getDate()).toBe(8);
    expect(previous.gte.getDate()).toBe(6);
    expect(previous.lt.getDate()).toBe(7);
  });

  it('minggu berjalan dimulai Senin', () => {
    // 2026-09-07 adalah hari Senin.
    const { current } = periodRanges('week', new Date('2026-09-09T10:00:00'));
    expect(current.gte.getDay()).toBe(1);
    expect(current.gte.getDate()).toBe(7);
  });

  it('bulan berjalan dimulai tanggal 1', () => {
    const { current } = periodRanges('month', new Date('2026-09-20T10:00:00'));
    expect(current.gte.getDate()).toBe(1);
    expect(current.gte.getMonth()).toBe(8);
  });
});

describe('jam operasional', () => {
  const hours = { mon: { open: '07:00', close: '17:00' }, sun: null };

  it('membaca jadwal hari yang sesuai', () => {
    // 2026-09-07 = Senin
    expect(todayHours(hours, new Date('2026-09-07T08:00:00'))).toEqual({
      open: '07:00',
      close: '17:00',
    });
  });

  it('hari tanpa jadwal mengembalikan null, bukan menebak tutup', () => {
    // 2026-09-06 = Minggu
    expect(todayHours(hours, new Date('2026-09-06T08:00:00'))).toBeNull();
    expect(todayHours(null, new Date())).toBeNull();
  });

  it('menentukan buka/tutup dari jam sekarang', () => {
    const h = { open: '07:00', close: '17:00' };
    expect(withinHours(h, new Date('2026-09-07T06:59:00'))).toBe(false);
    expect(withinHours(h, new Date('2026-09-07T07:00:00'))).toBe(true);
    expect(withinHours(h, new Date('2026-09-07T16:59:00'))).toBe(true);
    expect(withinHours(h, new Date('2026-09-07T17:00:00'))).toBe(false);
  });

  it('jadwal yang melewati tengah malam tetap terbaca buka', () => {
    const h = { open: '18:00', close: '01:00' };
    expect(withinHours(h, new Date('2026-09-07T23:30:00'))).toBe(true);
    expect(withinHours(h, new Date('2026-09-07T00:30:00'))).toBe(true);
    expect(withinHours(h, new Date('2026-09-07T12:00:00'))).toBe(false);
  });

  it('jam yang tidak valid tidak dianggap buka', () => {
    expect(withinHours({ open: 'pagi', close: 'sore' }, new Date())).toBe(
      false,
    );
    expect(withinHours({ open: '25:00', close: '26:00' }, new Date())).toBe(
      false,
    );
  });
});

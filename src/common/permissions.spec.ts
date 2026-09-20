import { Role } from '@prisma/client';
import {
  Permission,
  ROLE_DEFAULT_PERMISSIONS,
  resolvePermissions,
} from './permissions';

describe('permissions', () => {
  it('pegawai tidak mewarisi wewenang keputusan Admin Kopdes', () => {
    const pegawai = ROLE_DEFAULT_PERMISSIONS[Role.PEGAWAI_KOPDES];
    for (const denied of [
      Permission.PRODUCT_DELETE,
      Permission.CATEGORY_MANAGE,
      Permission.ORDER_CANCEL,
      Permission.MITRA_VERIFY,
      Permission.UMKM_PRODUCT_TAKEDOWN,
      Permission.FINANCE_READ_FULL,
      Permission.KOPDES_POLICY_MANAGE,
      Permission.USER_MANAGE,
    ]) {
      expect(pegawai).not.toContain(denied);
    }
  });

  it('pegawai tetap bisa mengerjakan operasional harian', () => {
    const pegawai = ROLE_DEFAULT_PERMISSIONS[Role.PEGAWAI_KOPDES];
    for (const granted of [
      Permission.PRODUCT_CREATE,
      Permission.PRODUCT_UPDATE,
      Permission.ORDER_PROCESS,
      Permission.DELIVERY_ASSIGN,
      Permission.INVENTORY_ADJUST,
      Permission.FINANCE_READ_SUMMARY,
      Permission.AI_ASSIST,
    ]) {
      expect(pegawai).toContain(granted);
    }
  });

  it('pelanggan, mitra, dan kurir tidak punya wewenang staf', () => {
    for (const role of [Role.CUSTOMER, Role.UMKM, Role.COURIER]) {
      expect(ROLE_DEFAULT_PERMISSIONS[role]).toHaveLength(0);
    }
  });

  it('daftar kosong berarti pakai bawaan role', () => {
    expect(resolvePermissions(Role.PEGAWAI_KOPDES, [])).toEqual(
      ROLE_DEFAULT_PERMISSIONS[Role.PEGAWAI_KOPDES],
    );
    expect(resolvePermissions(Role.PEGAWAI_KOPDES, null)).toEqual(
      ROLE_DEFAULT_PERMISSIONS[Role.PEGAWAI_KOPDES],
    );
  });

  it('override mempersempit, tidak menambah', () => {
    const narrowed = resolvePermissions(Role.PEGAWAI_KOPDES, [
      Permission.ORDER_READ,
      Permission.PRODUCT_DELETE, // di luar batas role — harus diabaikan
    ]);
    expect(narrowed).toEqual([Permission.ORDER_READ]);
  });

  it('override tidak bisa menaikkan pegawai menjadi setara admin', () => {
    const escalated = resolvePermissions(
      Role.PEGAWAI_KOPDES,
      ROLE_DEFAULT_PERMISSIONS[Role.ADMIN_KOPDES],
    );
    expect(escalated).not.toContain(Permission.MITRA_VERIFY);
    expect(escalated).not.toContain(Permission.FINANCE_READ_FULL);
  });
});

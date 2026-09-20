import { Role } from '@prisma/client';

/**
 * Katalog permission operasional Kopdes.
 *
 * Dipisah dari `Role` karena `PEGAWAI_KOPDES` mengerjakan pekerjaan harian
 * yang sama dengan `ADMIN_KOPDES` (input barang, proses pesanan, atur stok)
 * tetapi tidak boleh menyentuh keputusan koperasi — verifikasi mitra,
 * takedown produk, hapus produk, ubah kategori, laporan keuangan penuh.
 * Tanpa lapisan ini satu-satunya cara membedakan keduanya adalah
 * menyembunyikan tombol di Flutter, dan itu bukan pembatasan.
 */
export const Permission = {
  // Katalog barang Kopdes
  PRODUCT_READ: 'product:read',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',
  CATEGORY_MANAGE: 'category:manage',

  // Pesanan
  ORDER_READ: 'order:read',
  ORDER_PROCESS: 'order:process',
  ORDER_CANCEL: 'order:cancel',

  // Pengiriman & kurir
  DELIVERY_READ: 'delivery:read',
  DELIVERY_ASSIGN: 'delivery:assign',
  DELIVERY_UNASSIGN: 'delivery:unassign',

  // Stok
  INVENTORY_READ: 'inventory:read',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_OPNAME: 'inventory:opname',

  // Keuangan — ringkasan harian dipisah dari buku besar penuh
  FINANCE_READ_SUMMARY: 'finance:read:summary',
  FINANCE_READ_FULL: 'finance:read:full',

  // Mitra UMKM
  MITRA_READ: 'mitra:read',
  MITRA_VERIFY: 'mitra:verify',
  UMKM_PRODUCT_TAKEDOWN: 'umkm:product:takedown',
  UMKM_LOCATION_UPDATE: 'umkm:location:update',

  // AI
  AI_ASSIST: 'ai:assist',
  AI_EXECUTIVE: 'ai:executive',

  // Koperasi
  KOPDES_POLICY_MANAGE: 'kopdes:policy:manage',
  USER_MANAGE: 'user:manage',
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS = Object.values(Permission) as PermissionKey[];

/**
 * Wewenang bawaan pegawai: seluruh pekerjaan operasional harian, tanpa satu
 * pun tindakan yang mengubah kebijakan koperasi atau menghapus data.
 */
const PEGAWAI_DEFAULTS: PermissionKey[] = [
  Permission.PRODUCT_READ,
  Permission.PRODUCT_CREATE,
  Permission.PRODUCT_UPDATE,
  Permission.ORDER_READ,
  Permission.ORDER_PROCESS,
  Permission.DELIVERY_READ,
  Permission.DELIVERY_ASSIGN,
  Permission.DELIVERY_UNASSIGN,
  Permission.INVENTORY_READ,
  Permission.INVENTORY_ADJUST,
  Permission.INVENTORY_OPNAME,
  Permission.FINANCE_READ_SUMMARY,
  Permission.MITRA_READ,
  Permission.AI_ASSIST,
];

/**
 * Admin Kopdes: seluruh wewenang operasional ditambah keputusan koperasi,
 * kecuali pengelolaan akun lintas desa yang tetap milik Super Admin.
 */
const ADMIN_DEFAULTS: PermissionKey[] = [
  ...PEGAWAI_DEFAULTS,
  Permission.PRODUCT_DELETE,
  Permission.CATEGORY_MANAGE,
  Permission.ORDER_CANCEL,
  Permission.FINANCE_READ_FULL,
  Permission.MITRA_VERIFY,
  Permission.UMKM_PRODUCT_TAKEDOWN,
  Permission.UMKM_LOCATION_UPDATE,
  Permission.AI_EXECUTIVE,
  Permission.KOPDES_POLICY_MANAGE,
];

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN_KOPDES: ADMIN_DEFAULTS,
  PEGAWAI_KOPDES: PEGAWAI_DEFAULTS,
  CUSTOMER: [],
  UMKM: [],
  COURIER: [],
};

/**
 * Permission efektif seorang pengguna.
 *
 * `overrides` adalah kolom `User.permissions`. Kosong berarti "pakai bawaan
 * role" — jalur normal. Terisi berarti Admin/Super Admin sengaja mempersempit
 * atau memperluas satu pegawai tertentu, dan daftar itulah yang berlaku.
 *
 * Perluasan tetap dibatasi bawaan role: memberi `user:manage` kepada seorang
 * pegawai lewat kolom ini tidak akan berlaku, sehingga salah input di panel
 * admin tidak bisa menaikkan wewenang melewati batas rolenya.
 */
export function resolvePermissions(
  role: Role,
  overrides?: string[] | null,
): PermissionKey[] {
  const allowed = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
  if (!overrides || overrides.length === 0) return allowed;
  return allowed.filter((p) => overrides.includes(p));
}

export function hasPermission(
  granted: readonly string[],
  required: PermissionKey,
): boolean {
  return granted.includes(required);
}

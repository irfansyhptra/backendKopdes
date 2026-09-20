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

  /**
   * Mengelola akun pegawai di dalam Kopdes sendiri.
   *
   * Dipisah dari `USER_MANAGE` dengan sengaja. `USER_MANAGE` adalah wewenang
   * lintas desa milik Super Admin: membuat Admin Kopdes, memindahkan akun
   * antar koperasi, menyentuh pelanggan. `STAFF_MANAGE` hanya menyentuh
   * PEGAWAI_KOPDES di desa si pemegangnya, dan hanya boleh memberi wewenang
   * yang memang milik pegawai.
   */
  STAFF_MANAGE: 'staff:manage',
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
  // Admin Kopdes adalah pemilik koperasinya: ia yang mengangkat pegawainya
  // sendiri. Lingkupnya dijaga di service, bukan di sini.
  Permission.STAFF_MANAGE,
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


/**
 * Wewenang yang boleh diberikan Admin Kopdes kepada pegawainya.
 *
 * Persis bawaan pegawai — tidak lebih. Admin tidak bisa mengangkat pegawai
 * menjadi setara dirinya, dan `resolvePermissions` tetap menyaring sekali
 * lagi seandainya daftar ini suatu saat keliru diperluas.
 */
export const ASSIGNABLE_TO_PEGAWAI: PermissionKey[] = [...PEGAWAI_DEFAULTS];

export interface PermissionInfo {
  key: PermissionKey;
  /** Label yang dibaca pengurus koperasi, bukan nama teknisnya. */
  label: string;
  /** Bagian portal yang terbuka atau tertutup oleh izin ini. */
  group: string;
  description: string;
}

/**
 * Katalog berlabel untuk panel pengaturan akun.
 *
 * Labelnya tinggal di sini, bukan di masing-masing klien: web dan Flutter
 * memakai daftar yang sama, dan izin baru muncul dengan namanya sendiri
 * alih-alih sebagai kunci mentah seperti "inventory:opname".
 */
export const PERMISSION_CATALOG: PermissionInfo[] = [
  {
    key: Permission.PRODUCT_READ,
    label: 'Lihat katalog',
    group: 'Barang',
    description: 'Membuka daftar barang Kopdes.',
  },
  {
    key: Permission.PRODUCT_CREATE,
    label: 'Input barang baru',
    group: 'Barang',
    description: 'Menambah barang ke katalog koperasi.',
  },
  {
    key: Permission.PRODUCT_UPDATE,
    label: 'Ubah barang',
    group: 'Barang',
    description: 'Mengubah nama, harga, stok, dan gambar barang.',
  },
  {
    key: Permission.ORDER_READ,
    label: 'Lihat pesanan',
    group: 'Pesanan',
    description: 'Membuka daftar pesanan masuk dan riwayatnya.',
  },
  {
    key: Permission.ORDER_PROCESS,
    label: 'Proses pesanan',
    group: 'Pesanan',
    description: 'Memajukan status pesanan sampai siap dikirim.',
  },
  {
    key: Permission.DELIVERY_READ,
    label: 'Lihat pengiriman',
    group: 'Pengiriman',
    description: 'Membuka daftar pengantaran dan pelacakannya.',
  },
  {
    key: Permission.DELIVERY_ASSIGN,
    label: 'Tugaskan kurir',
    group: 'Pengiriman',
    description: 'Memilih kurir untuk sebuah pengantaran.',
  },
  {
    key: Permission.DELIVERY_UNASSIGN,
    label: 'Lepas kurir',
    group: 'Pengiriman',
    description: 'Membatalkan penugasan kurir yang belum mengambil barang.',
  },
  {
    key: Permission.INVENTORY_READ,
    label: 'Lihat stok',
    group: 'Stok',
    description: 'Membuka ringkasan dan mutasi stok.',
  },
  {
    key: Permission.INVENTORY_ADJUST,
    label: 'Sesuaikan stok',
    group: 'Stok',
    description: 'Mencatat barang masuk dan keluar.',
  },
  {
    key: Permission.INVENTORY_OPNAME,
    label: 'Stok opname',
    group: 'Stok',
    description: 'Mengoreksi stok tercatat ke hasil hitung fisik.',
  },
  {
    key: Permission.FINANCE_READ_SUMMARY,
    label: 'Rekap keuangan',
    group: 'Keuangan',
    description: 'Melihat omzet harian, mingguan, dan bulanan.',
  },
  {
    key: Permission.MITRA_READ,
    label: 'Lihat mitra UMKM',
    group: 'Mitra',
    description: 'Membuka daftar mitra UMKM desa.',
  },
  {
    key: Permission.AI_ASSIST,
    label: 'Asisten AI',
    group: 'Lainnya',
    description: 'Bertanya ke asisten operasional koperasi.',
  },
];

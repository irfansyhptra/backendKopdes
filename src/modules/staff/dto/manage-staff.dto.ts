import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { ASSIGNABLE_TO_PEGAWAI } from '../../../common/permissions';

/**
 * Peran yang boleh diangkat Admin Kopdes.
 *
 * Hanya dua. ADMIN_KOPDES tidak ada di sini: admin tidak mengangkat admin
 * lain, itu wewenang Super Admin. Daftar ini dipakai juga oleh validator,
 * jadi peran di luar keduanya ditolak sebelum menyentuh service.
 */
export const ASSIGNABLE_ROLES = [Role.PEGAWAI_KOPDES, Role.COURIER] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * `kopdesId` sengaja tidak ada: penugasan selalu mengikuti Kopdes si admin,
 * dan menjadikannya kolom yang bisa dikirim klien berarti membuka jalan
 * memindahkan akun ke desa lain.
 */
export class CreatePegawaiDto {
  /**
   * Dikosongkan berarti pegawai. Kurir adalah peran tersendiri: ia tidak
   * membuka portal pegawai sama sekali, jadi daftar wewenang di bawah tidak
   * berlaku untuknya.
   */
  @IsIn(ASSIGNABLE_ROLES, {
    message: 'Peran hanya boleh pegawai atau kurir.',
  })
  @IsOptional()
  role?: AssignableRole;

  @IsEmail({}, { message: 'Format email tidak benar.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  password!: string;

  @IsString()
  @MinLength(2, { message: 'Nama wajib diisi.' })
  name!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  /**
   * Kosong berarti "pakai bawaan peran" — pegawai penuh. Daftar yang boleh
   * dipilih dibatasi wewenang pegawai, jadi admin tidak bisa memberi sesuatu
   * yang bukan miliknya untuk diberikan.
   */
  @IsArray()
  @ArrayUnique()
  @IsIn(ASSIGNABLE_TO_PEGAWAI, {
    each: true,
    message: 'Ada wewenang yang tidak boleh diberikan kepada pegawai.',
  })
  @IsOptional()
  permissions?: string[];
}

export class UpdatePegawaiDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  /** Diisi berarti setel ulang kata sandi; dikosongkan berarti tidak diubah. */
  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @IsOptional()
  password?: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(ASSIGNABLE_TO_PEGAWAI, {
    each: true,
    message: 'Ada wewenang yang tidak boleh diberikan kepada pegawai.',
  })
  @IsOptional()
  permissions?: string[];
}

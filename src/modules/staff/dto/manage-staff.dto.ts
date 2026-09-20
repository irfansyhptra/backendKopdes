import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ASSIGNABLE_TO_PEGAWAI } from '../../../common/permissions';

/**
 * Peran tidak ikut sebagai field.
 *
 * Admin Kopdes hanya boleh mengangkat PEGAWAI_KOPDES. Menjadikannya kolom
 * yang bisa dikirim klien berarti menyerahkan pencegahan kenaikan wewenang
 * kepada validasi, padahal tidak ada alasan sah untuk mengubahnya — jadi
 * perannya dipasang di service dan tidak pernah dibaca dari body.
 *
 * `kopdesId` juga tidak ada: penugasan selalu mengikuti Kopdes si admin.
 */
export class CreatePegawaiDto {
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

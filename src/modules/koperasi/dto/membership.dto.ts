import { MembershipStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Pendaftaran anggota Kopdes.
 *
 * Tidak ada NIK di sini dengan sengaja: pengurus desa mengenal warganya, dan
 * menyimpan nomor identitas nasional menambah kewajiban perlindungan data
 * yang tidak sebanding manfaatnya. Yang diminta hanya yang benar-benar
 * dipakai untuk memverifikasi bahwa pemohon warga desa itu.
 */
export class ApplyMembershipDto {
  @IsString()
  @Length(2, 120)
  fullName!: string;

  /// Nomor Indonesia, dengan atau tanpa +62. Pengurus menghubungi lewat ini.
  @IsString()
  @Matches(/^(\+62|62|0)[0-9]{8,13}$/, {
    message: 'Nomor telepon tidak valid',
  })
  phone!: string;

  @IsString()
  @Length(5, 255)
  address!: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  note?: string;
}

/// Keputusan pengurus. `PENDING` tidak boleh dikirim: itu keadaan awal,
/// bukan hasil peninjauan.
export class ReviewMembershipDto {
  @IsIn([MembershipStatus.ACTIVE, MembershipStatus.REJECTED])
  status!: 'ACTIVE' | 'REJECTED';

  @IsString()
  @IsOptional()
  @Length(0, 500)
  reviewNote?: string;
}

export class MembershipQueryDto {
  @IsIn(Object.values(MembershipStatus))
  @IsOptional()
  status?: MembershipStatus;

  /// Hanya dipakai Super Admin, yang memang tidak terikat satu desa. Untuk
  /// Admin Kopdes nilainya diabaikan: lingkupnya diambil dari token.
  @IsString()
  @IsOptional()
  kopdesId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

/**
 * Profil koperasi yang boleh diubah pengurusnya sendiri.
 *
 * Alamat dan koordinat TIDAK ada di sini: keduanya menentukan pencarian
 * terdekat dan keanggotaan sedesa, jadi perubahannya lewat Super Admin.
 */
export class UpdateKopdesProfileDto {
  @IsString()
  @IsOptional()
  @Length(0, 1000)
  description?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(\+62|62|0)[0-9]{8,13}$/, { message: 'Nomor telepon tidak valid' })
  phone?: string;

  /// Layanan yang tampil di card dan halaman detail, mis. ["Sembako"].
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(2, 40, { each: true })
  serviceCategories?: string[];

  /// `{ "mon": { "open": "07:00", "close": "17:00" }, "sun": null }`.
  /// Bentuknya diperiksa di service lewat `normalizeOperatingHours`.
  @IsObject()
  @IsOptional()
  operatingHours?: Record<string, { open: string; close: string } | null>;

  /// Hanya dipakai Super Admin; Admin Kopdes terkunci ke desanya sendiri.
  @IsString()
  @IsOptional()
  kopdesId?: string;
}

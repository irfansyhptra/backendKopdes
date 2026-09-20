import {
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Formulir pengajuan — dikirim tanpa autentikasi.
 *
 * Panjang tiap kolom dibatasi karena endpoint ini terbuka: tanpa batas, satu
 * permintaan bisa menitipkan megabyte teks ke database.
 */
export class SubmitKopdesApplicationDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama koperasi wajib diisi.' })
  @MaxLength(120)
  kopdesName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(600)
  description?: string;

  @IsString()
  @IsNotEmpty({ message: 'Alamat wajib diisi.' })
  @MaxLength(300)
  address!: string;

  @IsString()
  @IsNotEmpty({ message: 'Desa wajib diisi.' })
  @MaxLength(100)
  village!: string;

  @IsString()
  @IsNotEmpty({ message: 'Kecamatan wajib diisi.' })
  @MaxLength(100)
  district!: string;

  @IsString()
  @IsNotEmpty({ message: 'Kabupaten/kota wajib diisi.' })
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty({ message: 'Provinsi wajib diisi.' })
  @MaxLength(100)
  province!: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  postalCode?: string;

  @IsString()
  @IsNotEmpty({ message: 'Nama pengurus wajib diisi.' })
  @MaxLength(120)
  contactName!: string;

  @IsEmail({}, { message: 'Format email tidak benar.' })
  contactEmail!: string;

  /// Nomor ini dipakai mengirim akun lewat WhatsApp, jadi bentuknya dijaga.
  @IsString()
  @Matches(/^[0-9+][0-9 ()-]{7,19}$/, {
    message: 'Nomor telepon tidak valid.',
  })
  contactPhone!: string;

  @IsString()
  @IsOptional()
  @MaxLength(600)
  notes?: string;
}

/**
 * Persetujuan sekaligus melengkapi data yang tidak diminta di formulir.
 *
 * Koordinat ditanyakan di sini, bukan di formulir publik: pengurus desa sering
 * tidak tahu titiknya, dan tanpa koordinat koperasinya tidak akan pernah
 * muncul di pencarian terdekat.
 */
export class ApproveKopdesApplicationDto {
  @IsLatitude({ message: 'Latitude tidak valid.' })
  latitude!: number;

  @IsLongitude({ message: 'Longitude tidak valid.' })
  longitude!: number;

  @IsString()
  @IsOptional()
  @MaxLength(400)
  reviewNote?: string;

  /**
   * Kata sandi awal. Dikosongkan berarti sistem membuatkannya.
   *
   * Apa pun asalnya, nilainya hanya dikembalikan satu kali pada respons
   * persetujuan dan tidak pernah disimpan selain sebagai hash.
   */
  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @IsOptional()
  initialPassword?: string;
}

export class RejectKopdesApplicationDto {
  @IsString()
  @IsNotEmpty({ message: 'Alasan penolakan wajib diisi.' })
  @MaxLength(400)
  reviewNote!: string;
}

/**
 * Pembuatan koperasi langsung, tanpa formulir pengajuan.
 *
 * Isinya gabungan formulir dan data yang biasanya dilengkapi saat menyetujui:
 * Super Admin sudah berbicara dengan pengurusnya, jadi ia mengisi semuanya
 * sekaligus. Koordinat wajib di sini — tanpa itu koperasinya tidak akan
 * pernah muncul di pencarian terdekat, dan tidak ada langkah kedua yang bisa
 * melengkapinya.
 */
export class CreateKopdesDirectDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama koperasi wajib diisi.' })
  @MaxLength(120)
  kopdesName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(600)
  description?: string;

  @IsString()
  @IsNotEmpty({ message: 'Alamat wajib diisi.' })
  @MaxLength(300)
  address!: string;

  @IsString()
  @IsNotEmpty({ message: 'Desa wajib diisi.' })
  @MaxLength(100)
  village!: string;

  @IsString()
  @IsNotEmpty({ message: 'Kecamatan wajib diisi.' })
  @MaxLength(100)
  district!: string;

  @IsString()
  @IsNotEmpty({ message: 'Kabupaten/kota wajib diisi.' })
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty({ message: 'Provinsi wajib diisi.' })
  @MaxLength(100)
  province!: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  postalCode?: string;

  @IsLatitude({ message: 'Latitude tidak valid.' })
  latitude!: number;

  @IsLongitude({ message: 'Longitude tidak valid.' })
  longitude!: number;

  @IsString()
  @IsNotEmpty({ message: 'Nama pengurus wajib diisi.' })
  @MaxLength(120)
  contactName!: string;

  @IsEmail({}, { message: 'Format email tidak benar.' })
  contactEmail!: string;

  @IsString()
  @Matches(/^[0-9+][0-9 ()-]{7,19}$/, { message: 'Nomor telepon tidak valid.' })
  contactPhone!: string;

  /** Dikosongkan berarti sistem membuatkannya. Dikembalikan satu kali saja. */
  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  @IsOptional()
  initialPassword?: string;
}

import * as crypto from 'crypto';
import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';

/**
 * Tanda tangan unggahan Cloudinary.
 *
 * Berkas gambar tidak melewati server sama sekali: klien meminta tanda
 * tangan di sini, lalu mengunggah langsung ke Cloudinary. Alasannya batas
 * badan permintaan 4,5 MB pada fungsi serverless Vercel — satu foto ponsel
 * saja sering melampauinya.
 *
 * Yang dikirim balik hanya tanda tangan untuk satu unggahan, berlaku sesaat.
 * `CLOUDINARY_API_SECRET` tidak pernah meninggalkan server.
 *
 * Dijaga permission, bukan sekadar login: tanpa itu setiap pelanggan yang
 * punya akun bisa memakai kuota Cloudinary koperasi sebagai penyimpanan
 * gratis. Unsigned upload preset lebih buruk lagi — siapa pun yang membaca
 * sumber halaman bisa mengunggah apa saja tanpa akun sama sekali.
 */
@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN, Role.UMKM)
@RequirePermissions(Permission.PRODUCT_CREATE)
export class CloudinarySignatureController {
  constructor(private readonly config: ConfigService) {}

  /** Folder tetap supaya berkas tidak tercecer di akar akun Cloudinary. */
  private static readonly FOLDER = 'kopdes/products';

  @Get('signature')
  signature() {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    // 503, bukan 500: ini bukan galat pemakai, dan pesannya menyebut apa
    // yang kurang supaya pengurus tahu harus mengisi apa.
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'Penyimpanan gambar belum dikonfigurasi. Lengkapi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET.',
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = CloudinarySignatureController.FOLDER;

    // Parameter ditandatangani urut abjad, tanpa api_key, lalu di-SHA1
    // bersama api_secret. Aturan Cloudinary, bukan pilihan.
    const signature = crypto
      .createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');

    return {
      success: true,
      data: { cloudName, apiKey, timestamp, folder, signature },
    };
  }
}

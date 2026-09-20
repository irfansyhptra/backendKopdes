import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/// Slug yang dirujuk aplikasi. Dikumpulkan di sini supaya tidak tersebar
/// sebagai string lepas di layar-layar Flutter maupun di seed.
export const CONTENT_SLUGS = {
  belanjaLokal: 'belanja-lokal',
  manfaatAnggota: 'manfaat-anggota',
} as const;

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil halaman informasi berdasarkan slug.
   *
   * Halaman yang belum terbit diperlakukan seperti tidak ada: materi
   * keanggotaan yang belum disetujui pengurus tidak boleh sampai ke pengguna
   * hanya karena barisnya sudah dibuat.
   */
  async findBySlug(slug: string) {
    const page = await this.prisma.contentPage.findFirst({
      where: { slug, isPublished: true },
      select: {
        slug: true,
        title: true,
        subtitle: true,
        sections: true,
        footnote: true,
        updatedAt: true,
      },
    });

    if (!page) {
      throw new NotFoundException('Halaman informasi belum tersedia.');
    }

    return page;
  }
}

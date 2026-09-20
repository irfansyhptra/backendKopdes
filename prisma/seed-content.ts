/**
 * Seed ADITIF untuk halaman informasi.
 *
 *     npm run seed:content
 *
 * Idempoten; tidak menghapus apa pun.
 *
 * ══════════════════════════════════════════════════════════════════
 * PENTING — halaman `manfaat-anggota`
 *
 * Isi di bawah sengaja hanya menjelaskan PRINSIP UMUM koperasi. Tidak ada
 * satu pun angka: tidak ada nominal simpanan pokok, tidak ada persentase SHU,
 * tidak ada janji imbal hasil.
 *
 * Hal-hal itu diatur AD/ART masing-masing koperasi dan hanya boleh diisi
 * pengurus Kopdes — bukan ditulis pengembang. Pengurus melengkapinya lewat
 * kolom `sections` pada tabel ContentPage.
 * ══════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PAGES = [
  {
    slug: 'belanja-lokal',
    title: 'Belanja Lokal, Desa Lebih Kuat',
    subtitle: 'Ke mana uang belanja Anda pergi',
    isPublished: true,
    sections: [
      {
        heading: 'Uang yang berputar di desa',
        body:
          'Ketika Anda membeli dari Kopdes atau Mitra UMKM, sebagian besar '
          + 'nilai transaksinya tetap berada di desa: menjadi penghasilan '
          + 'pelaku usaha, upah kurir, dan pemasukan koperasi.',
      },
      {
        heading: 'Manfaat bagi Kopdes',
        body:
          'Fee penjualan dari Mitra UMKM masuk ke rekening Kopdes dan dipakai '
          + 'membiayai operasional serta promosi bersama, sesuai ketentuan '
          + 'koperasi yang berlaku.',
      },
      {
        heading: 'Manfaat bagi Mitra UMKM',
        body:
          'Mitra mendapat lapak digital tanpa perlu membangun tokonya sendiri, '
          + 'dan dapat mengantar pesanannya sendiri bila ingin memperoleh '
          + 'ongkos kirimnya.',
      },
      {
        heading: 'Manfaat bagi warga',
        body:
          'Barang kebutuhan harian tersedia lebih dekat, dengan pilihan ambil '
          + 'di tempat tanpa antre atau diantar kurir desa.',
      },
    ],
    footnote:
      'Isi halaman ini dikelola pengurus Kopdes dan dapat diperbarui '
      + 'sewaktu-waktu.',
  },
  {
    slug: 'manfaat-anggota',
    title: 'Menjadi Anggota Koperasi',
    subtitle: 'Hal-hal yang perlu Anda ketahui lebih dulu',
    isPublished: true,
    sections: [
      {
        heading: 'Koperasi dimiliki anggotanya',
        body:
          'Koperasi adalah badan usaha yang dimiliki dan dijalankan oleh '
          + 'anggotanya. Sebagai anggota, Anda ikut memiliki, ikut mengawasi, '
          + 'dan ikut menanggung hasil usahanya — baik ketika untung maupun '
          + 'ketika rugi.',
      },
      {
        heading: 'Hak anggota',
        body:
          'Secara umum anggota berhak menghadiri dan memberikan suara dalam '
          + 'Rapat Anggota, memperoleh pelayanan koperasi, memperoleh '
          + 'informasi mengenai jalannya usaha, serta mengundurkan diri '
          + 'sesuai ketentuan yang berlaku.',
      },
      {
        heading: 'Kewajiban anggota',
        body:
          'Anggota umumnya wajib mematuhi Anggaran Dasar dan Anggaran Rumah '
          + 'Tangga, memenuhi simpanan sebagaimana diatur koperasi, serta '
          + 'ikut menjaga nama baik koperasi.',
      },
      {
        heading: 'Tentang simpanan',
        body:
          'Keanggotaan koperasi biasanya melibatkan simpanan pokok dan '
          + 'simpanan wajib. Simpanan bukan tabungan berbunga dan bukan '
          + 'investasi dengan imbal hasil tetap. Besaran, tata cara '
          + 'penyetoran, dan syarat pengembaliannya diatur AD/ART koperasi.',
      },
      {
        heading: 'Tentang SHU',
        body:
          'Sisa Hasil Usaha dibagikan menurut ketentuan koperasi dan besarnya '
          + 'bergantung pada hasil usaha pada tahun berjalan. SHU tidak '
          + 'dijanjikan dan dapat tidak ada apabila koperasi tidak memperoleh '
          + 'hasil usaha.',
      },
      {
        heading: 'Risiko yang perlu dipahami',
        body:
          'Sebagai pemilik, anggota ikut menanggung risiko usaha koperasi. '
          + 'Dana simpanan tidak dijamin memberikan keuntungan dan '
          + 'pengembaliannya mengikuti ketentuan yang berlaku saat pengunduran '
          + 'diri.',
      },
      {
        heading: 'Ketentuan resmi Kopdes ini',
        body:
          'Besaran simpanan, mekanisme pembagian SHU, syarat pendaftaran, dan '
          + 'ketentuan pengunduran diri yang berlaku khusus di koperasi ini '
          + 'belum dicantumkan pada halaman ini. Silakan hubungi pengurus '
          + 'Kopdes untuk memperoleh salinan AD/ART dan penjelasan resminya '
          + 'sebelum mendaftar.',
      },
    ],
    footnote:
      'Halaman ini menjelaskan prinsip umum koperasi, bukan penawaran '
      + 'investasi. Ketentuan yang mengikat adalah AD/ART koperasi. Isi '
      + 'halaman dikelola pengurus Kopdes.',
  },
];

async function main() {
  for (const page of PAGES) {
    const existing = await prisma.contentPage.findUnique({
      where: { slug: page.slug },
    });

    if (existing) {
      console.log(`· "${page.slug}" sudah ada, tidak ditimpa`);
      continue;
    }

    await prisma.contentPage.create({ data: page });
    console.log(`✓ "${page.slug}" dibuat (${page.sections.length} bagian)`);
  }

  const total = await prisma.contentPage.count({ where: { isPublished: true } });
  console.log(`\nHalaman terbit: ${total}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

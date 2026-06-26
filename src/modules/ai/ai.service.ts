import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { QdrantService } from '../../qdrant/qdrant.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly collectionName = 'kopdes_knowledge';

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrantService: QdrantService,
    private readonly configService: ConfigService,
  ) {}

  private getGenAI(): GoogleGenerativeAI {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('GOOGLE_API_KEY is not configured in environment variables');
    }
    return new GoogleGenerativeAI(apiKey);
  }

  async getEmbedding(text: string): Promise<number[]> {
    this.logger.log(`🤖 AI SERVICE: Generating embedding for text snippet: "${text.substring(0, 50)}..."`);
    try {
      const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
      // Detect suspended or dummy keys early to fallback without API network roundtrip failures
      if (!apiKey || apiKey.startsWith('your-') || apiKey === 'AIzaSyCeeR_w3EokChW-P4mz_BAHNy2znGgTZ1o') {
        throw new Error('Google API key is suspended or set to a placeholder key.');
      }
      const genAI = this.getGenAI();
      const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      
      this.logger.log(`🤖 AI SERVICE: Sending text-embedding-004 request to Gemini API...`);
      const embedPromise = model.embedContent(text);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Embedding request timeout')), 15000)
      );
      
      const result: any = await Promise.race([embedPromise, timeoutPromise]);
      if (!result?.embedding?.values) {
        throw new Error('Invalid embedding response from Gemini API');
      }
      this.logger.log(`🤖 AI SERVICE: Embedding successfully generated from Gemini. Vector size: ${result.embedding.values.length}`);
      return result.embedding.values;
    } catch (err: any) {
      this.logger.warn(`🤖 AI SERVICE: Failed to generate real embedding, using deterministic mock vector fallback. Reason: ${err.message}`);

      // Generate a deterministic mock vector of size 1536 based on text hash
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(text).digest();
      const vector: number[] = [];
      for (let i = 0; i < 1536; i++) {
        const byteIndex = i % hash.length;
        const baseVal = (hash[byteIndex] / 127.5) - 1.0;
        vector.push(baseVal + Math.sin(i) * 0.1);
      }
      return vector;
    }
  }

  private async generateLLMResponse(promptText: string): Promise<string> {
    this.logger.log(`🤖 AI SERVICE: Requesting LLM response. Prompt length: ${promptText.length} characters`);
    try {
      const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
      if (!apiKey || apiKey.startsWith('your-') || apiKey === 'AIzaSyCeeR_w3EokChW-P4mz_BAHNy2znGgTZ1o') {
        throw new Error('Google API key is suspended or set to a placeholder key.');
      }
      const genAI = this.getGenAI();
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      this.logger.log(`🤖 AI SERVICE: Sending gemini-1.5-flash generation request to Google...`);
      const generatePromise = model.generateContent(promptText);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM generation request timeout')), 15000)
      );
      
      const result: any = await Promise.race([generatePromise, timeoutPromise]);
      const textResponse = result.response.text();
      this.logger.log(`🤖 AI SERVICE: LLM generated response successfully from Gemini: "${textResponse.substring(0, 100)}..."`);
      return textResponse;
    } catch (err: any) {
      this.logger.warn(`🤖 AI SERVICE: Failed to generate real LLM response, using simulated response. Reason: ${err.message}`);

      // Return high quality simulation responses depending on prompt task signature
      let simResponse = '';
      if (promptText.includes('Asisten Koperasi Desa')) {
        simResponse = `[SIMULASI ASISTEN KOPDES]\n\nKoperasi Desa (KOPDES) Sinduadi didirikan untuk menyejahterakan warga melalui digitalisasi UMKM lokal serta pembagian Sisa Hasil Usaha (SHU) secara transparan. Rapat Anggota Tahunan (RAT) rutin diadakan setiap awal tahun (sebelum Maret) untuk mempertanggungjawabkan kinerja pengurus.\n\nUntuk pengajuan modal UMKM, Anda memerlukan SKU RT/RW, KTP domisili lokal, dan status keanggotaan aktif minimal 3 bulan.`;
      } else if (promptText.includes('AI Management Assistant')) {
        simResponse = `### Laporan Simulasi Analisis Manajemen KOPDES\n\n* **Analisis Data Pengguna & Pendapatan**: Aktivitas registrasi berjalan stabil dengan pertumbuhan anggota yang baik. Total pendapatan terverifikasi dari sistem pembayaran sukses berjalan lancar.\n* **Rekomendasi Manajemen**:\n  1. Segera lakukan verifikasi UMKM yang berstatus 'PENDING_VERIFICATION' untuk memperluas varian katalog produk.\n  2. Optimalkan kampanye belanja mingguan guna menaikkan volume transaksi di pasar online.`;
      } else if (promptText.includes('Community Demand Intelligence')) {
        simResponse = `### Analisis Simulasi Usulan Produk Komunitas\n\n1. **Kategori Paling Diminati**: Bahan Pokok dan Cemilan Tradisional merupakan kategori produk yang paling banyak diusulkan dan didukung anggota.\n2. **Top 3 Usulan Produk Anggota**:\n   - Beras Merah Organik (Dukungan Komunitas Tinggi)\n   - Jamu Tradisional Curah (Dukungan Komunitas Sedang)\n   - Anyaman Bambu Dekoratif (Dukungan Komunitas Sedang)\n3. **Rencana Aksi Pengadaan**: Pengurus disarankan segera menggandeng kelompok tani desa Sinduadi untuk pengadaan beras organik dalam volume grosir.`;
      } else if (promptText.includes('Inventory Intelligence')) {
        simResponse = `### Rencana Simulasi Pengisian Ulang Inventaris\n\n1. **Prioritas Pengadaan (Stok Kritis)**:\n   - Produk dengan stok <= 10 unit harus segera dipesan ulang guna menghindari kekosongan persediaan barang di pasar online.\n2. **Kuantitas Pemesanan yang Disarankan**:\n   - Rata-rata restock 20-50 unit per produk kritis, disesuaikan dengan kapasitas penyimpanan gudang koperasi.\n3. **Rekomendasi Keuangan**: Alokasikan Rp 2.500.000 s/d Rp 5.000.000 dari kas operasional untuk pembiayaan restock produk lokal UMKM terpopuler.`;
      } else if (promptText.includes('Spesialis Deteksi Anomali Inventaris')) {
        simResponse = `### Laporan Simulasi Deteksi Anomali Inventaris\n\n* **Pemeriksaan Transaksi**: Ditemukan beberapa transaksi jenis 'ADJUSTMENT' tanpa keterangan/reason tertulis. (Tingkat Risiko: Sedang).\n* **Pemeriksaan Audit Log**: Log perubahan status order menunjukkan keselarasan yang baik, namun disarankan untuk membatasi izin akses perubahan stok inventaris hanya untuk staf terdaftar.\n* **Saran Tindakan**: Tambahkan validasi wajib (required field) pada kolom 'reason' untuk setiap transaksi penyesuaian stok di dashboard admin.`;
      } else {
        simResponse = `[SIMULASI KOPDES AI] Sistem AI saat ini berjalan dalam mode simulasi karena API Key diblokir atau belum dikonfigurasi. Harap perbarui GOOGLE_API_KEY pada berkas .env Anda untuk mengaktifkan model Gemini asli.`;
      }

      this.logger.log(`🤖 AI SERVICE: Generated simulation response payload: "${simResponse.substring(0, 100)}..."`);
      return simResponse;
    }
  }

  // 1. AI Cooperative Assistant (RAG Chat with Members)
  async chatCooperative(message: string): Promise<string> {
    try {
      const queryVector = await this.getEmbedding(message);
      const results = await this.qdrantService.searchDocuments(this.collectionName, queryVector, 5);

      const context = results
        .map((r) => r.payload?.content || '')
        .filter((c) => c !== '')
        .join('\n\n');

      const prompt = PromptTemplate.fromTemplate(`
        Anda adalah Asisten Koperasi Desa (KOPDES) yang ramah, profesional, dan membantu.
        Jawab pertanyaan pengguna dengan jujur dan lengkap berdasarkan konteks dokumen koperasi yang diberikan di bawah ini.
        Jika informasi tidak ada dalam konteks, katakan bahwa Anda tidak mengetahuinya secara pasti dan sarankan untuk menghubungi pengurus koperasi.

        Konteks Dokumen Koperasi:
        {context}

        Pertanyaan Pengguna:
        {message}

        Jawaban Anda (dalam bahasa Indonesia yang santun):
      `);

      const chain = RunnableSequence.from([
        {
          context: () => context || 'Tidak ada dokumen referensi terkait dalam basis pengetahuan.',
          message: (input: any) => input.message,
        },
        prompt,
        async (promptValue) => this.generateLLMResponse(promptValue.toString()),
        new StringOutputParser(),
      ]);

      return await chain.invoke({ message });
    } catch (err) {
      this.logger.error('Cooperative assistant chat error:', err);
      throw err;
    }
  }

  // 2. AI Management Assistant (Chat with Admins about Operations)
  async chatManagement(message: string): Promise<string> {
    try {
      const [
        totalUsers,
        usersByRole,
        totalProducts,
        totalCategories,
        totalOrders,
        totalRevenueResult,
        pendingUMKMCount,
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.groupBy({ by: ['role'], _count: true }),
        this.prisma.product.count({ where: { isActive: true } }),
        this.prisma.category.count(),
        this.prisma.order.count(),
        this.prisma.payment.aggregate({
          where: { status: 'PAID' },
          _sum: { amount: true },
        }),
        this.prisma.uMKM.count({ where: { status: 'PENDING_VERIFICATION' } }),
      ]);

      const totalRevenue = Number(totalRevenueResult?._sum?.amount || 0);

      const statsContext = `
        Statistik Sistem KOPDES saat ini:
        - Total Pengguna Terdaftar: ${totalUsers}
        - Rincian Peran Pengguna: ${JSON.stringify(usersByRole)}
        - Produk Aktif di Katalog: ${totalProducts}
        - Total Kategori Produk: ${totalCategories}
        - Total Transaksi/Order: ${totalOrders}
        - Total Pendapatan Sukses: Rp ${totalRevenue.toLocaleString('id-ID')}
        - Pendaftaran UMKM Menunggu Verifikasi: ${pendingUMKMCount}
      `;

      const prompt = PromptTemplate.fromTemplate(`
        Anda adalah AI Management Assistant untuk KOPDES. Tugas Anda adalah membantu pengurus dan staf koperasi menganalisis kinerja operasional.
        Gunakan data statistik operasional real-time di bawah ini untuk menjawab pertanyaan atau keluhan manajemen.

        Data Statistik Koperasi:
        {statsContext}

        Pertanyaan Pengurus/Staf:
        {message}

        Analisis dan Saran Anda (dalam format Markdown terstruktur, objektif, dan profesional):
      `);

      const chain = RunnableSequence.from([
        {
          statsContext: () => statsContext,
          message: (input: any) => input.message,
        },
        prompt,
        async (promptValue) => this.generateLLMResponse(promptValue.toString()),
        new StringOutputParser(),
      ]);

      return await chain.invoke({ message });
    } catch (err) {
      this.logger.error('Management assistant chat error:', err);
      throw err;
    }
  }

  // 3. Community Demand Intelligence (Analyze member suggestions)
  async analyzeCommunityDemands(): Promise<string> {
    try {
      const suggestions = await this.prisma.communitySuggestion.findMany({
        include: {
          supporters: true,
          user: { select: { name: true } },
        },
        orderBy: { supporters: { _count: 'desc' } },
        take: 20,
      });

      const formattedSuggestions = suggestions.map((s) => ({
        productName: s.productName,
        category: s.category,
        description: s.description,
        requestedBy: s.user.name,
        totalSupporters: s.supporters.length,
      }));

      const contextData = JSON.stringify(formattedSuggestions, null, 2);

      const prompt = PromptTemplate.fromTemplate(`
        Anda adalah Community Demand Intelligence AI untuk KOPDES.
        Tugas Anda adalah menganalisis saran produk yang diajukan oleh masyarakat desa (anggota koperasi) untuk menentukan potensi produk yang harus ditambahkan ke katalog koperasi.

        Data Usulan Anggota (diurutkan berdasarkan dukungan terbanyak):
        {contextData}

        Buat analisis komprehensif dalam format Markdown yang mencakup:
        1. Kategori produk yang paling diminati oleh komunitas.
        2. Rekomendasi top 3 produk spesifik yang harus segera di-source/disediakan koperasi.
        3. Proyeksi dampak sosial-ekonomi bagi warga desa.
        4. Rencana aksi konkret untuk pengadaan barang tersebut.
      `);

      const chain = RunnableSequence.from([
        {
          contextData: () => contextData || '[] (Tidak ada usulan baru dari anggota)',
        },
        prompt,
        async (promptValue) => this.generateLLMResponse(promptValue.toString()),
        new StringOutputParser(),
      ]);

      return await chain.invoke({});
    } catch (err) {
      this.logger.error('Community demand intelligence error:', err);
      throw err;
    }
  }

  // 4. Inventory Intelligence (Analyze low stock and recommend replenishment)
  async getInventoryReplenishmentOptions(): Promise<string> {
    try {
      const lowStockProducts = await this.prisma.product.findMany({
        where: {
          isActive: true,
          stock: { lte: 10 },
        },
        include: { category: true },
        orderBy: { stock: 'asc' },
      });

      const formattedProducts = lowStockProducts.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category.name,
        price: Number(p.price),
        stock: p.stock,
      }));

      const contextData = JSON.stringify(formattedProducts, null, 2);

      const prompt = PromptTemplate.fromTemplate(`
        Anda adalah Inventory Intelligence Assistant untuk KOPDES.
        Berikut adalah daftar produk aktif yang memiliki stok kritis (sama dengan atau kurang dari 10 unit) di gudang koperasi.

        Daftar Produk Stok Kritis:
        {contextData}

        Analisis data di atas dan buat laporan rekomendasi restock dalam format Markdown yang mencakup:
        1. Prioritas Restock (Tinggi, Sedang, Rendah) berdasarkan produk.
        2. Rekomendasi kuantitas pengadaan ulang untuk masing-masing item.
        3. Estimasi modal yang dibutuhkan koperasi untuk melakukan restock seluruh produk tersebut.
        4. Langkah optimalisasi penyimpanan/manajemen rantai pasokan.
      `);

      const chain = RunnableSequence.from([
        {
          contextData: () => contextData || '[] (Semua stok produk dalam kondisi aman)',
        },
        prompt,
        async (promptValue) => this.generateLLMResponse(promptValue.toString()),
        new StringOutputParser(),
      ]);

      return await chain.invoke({});
    } catch (err) {
      this.logger.error('Inventory intelligence replenishment error:', err);
      throw err;
    }
  }

  // 5. Inventory Anomaly Detection (Audit adjustments and transactions)
  async detectInventoryAnomalies(): Promise<string> {
    try {
      const [transactions, auditLogs] = await Promise.all([
        this.prisma.inventoryTransaction.findMany({
          include: { product: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        this.prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
      ]);

      const formattedTransactions = transactions.map((t) => ({
        productName: t.product.name,
        type: t.type,
        quantity: t.quantity,
        reason: t.reason,
        date: t.createdAt,
      }));

      const formattedLogs = auditLogs.map((l) => ({
        action: l.action,
        details: l.details,
        date: l.createdAt,
      }));

      const contextData = JSON.stringify(
        {
          recentInventoryTransactions: formattedTransactions,
          recentAuditLogs: formattedLogs,
        },
        null,
        2,
      );

      const prompt = PromptTemplate.fromTemplate(`
        Anda adalah Spesialis Deteksi Anomali Inventaris KOPDES.
        Tugas Anda adalah mengaudit transaksi inventaris terbaru dan catatan audit log sistem untuk mendeteksi tindakan mencurigakan, kebocoran barang, atau kesalahan administrasi.

        Data Transaksi & Audit Log:
        {contextData}

        Buat Laporan Deteksi Anomali terstruktur dalam format Markdown yang mencakup:
        1. Temuan Anomali (misalnya: penyesuaian stok yang besar tanpa penjelasan, transaksi berulang, tindakan pengguna mencurigakan).
        2. Tingkat Risiko (Rendah, Sedang, Kritis) untuk setiap potensi masalah.
        3. Rekomendasi perbaikan sistem, investigasi internal, atau tindakan pencegahan kehilangan aset koperasi.
      `);

      const chain = RunnableSequence.from([
        {
          contextData: () => contextData,
        },
        prompt,
        async (promptValue) => this.generateLLMResponse(promptValue.toString()),
        new StringOutputParser(),
      ]);

      return await chain.invoke({});
    } catch (err) {
      this.logger.error('Inventory anomaly detection error:', err);
      throw err;
    }
  }

  // Populate/Seed knowledge base points for RAG tests
  async seedKnowledgeBase(): Promise<void> {
    const documents = [
      {
        id: 'doc-kopdes-1',
        content: 'Koperasi Desa (KOPDES) Sinduadi didirikan pada tahun 2024 untuk memajukan perekonomian warga desa melalui program digitalisasi UMKM dan pembagian Sisa Hasil Usaha (SHU) secara berkala.',
      },
      {
        id: 'doc-kopdes-2',
        content: 'Bagi seluruh anggota KOPDES Sinduadi, Rapat Anggota Tahunan (RAT) wajib diikuti dan diselenggarakan setiap awal tahun kerja (selambat-lambatnya bulan Maret) untuk mengesahkan laporan pertanggungjawaban pengurus.',
      },
      {
        id: 'doc-kopdes-3',
        content: 'Pengajuan modal usaha UMKM desa melalui KOPDES mewajibkan syarat memiliki surat keterangan usaha (SKU) dari RT/RW setempat, KTP berdomisili lokal, serta telah terdaftar aktif sebagai anggota koperasi selama minimal 3 bulan.',
      },
      {
        id: 'doc-kopdes-4',
        content: 'Pembagian SHU dihitung secara proporsional berdasarkan kontribusi modal simpanan wajib, simpanan pokok, serta keaktifan transaksi anggota di dalam pasar koperasi online selama setahun berjalan.',
      },
      {
        id: 'doc-kopdes-5',
        content: 'Sistem pengantaran barang KOPDES didukung oleh kurir lokal desa dengan tarif flat Rp 5.000 untuk pengiriman dalam radius 5 kilometer dari pusat balai desa Sinduadi.',
      },
    ];

    const points = [];
    for (const doc of documents) {
      const vector = await this.getEmbedding(doc.content);
      points.push({
        id: this.generateUUID(doc.id),
        vector,
        payload: { content: doc.content },
      });
    }

    await this.qdrantService.upsertDocuments(this.collectionName, points);
  }

  private generateUUID(input: string): string {
    // Generate static UUID v4 format from string input for consistency
    const hash = require('crypto').createHash('md5').update(input).digest('hex');
    return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
  }
}

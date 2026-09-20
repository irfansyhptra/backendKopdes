import { Controller, Get, Param, Query } from '@nestjs/common';

import { DiscoveryService } from './discovery.service';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceQueryDto } from './dto/marketplace-query.dto';
import {
  BestSellersQueryDto,
  FeaturedQueryDto,
} from './dto/discovery-query.dto';

/**
 * Endpoint penemuan konten beranda.
 *
 * Dikelompokkan dalam satu modul karena semuanya menjawab pertanyaan yang
 * sama — "apa yang layak ditampilkan di beranda" — dan tidak ada yang
 * bertumpang tindih dengan CRUD produk di ProductModule.
 */
@Controller()
export class DiscoveryController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly marketplace: MarketplaceService,
  ) {}

  /// Katalog terpadu Kopdes + Mitra UMKM. Endpoint `/products` yang lama
  /// hanya membaca tabel Product dan tidak bisa menampilkan produk mitra.
  @Get('marketplace/products')
  async marketplaceProducts(@Query() query: MarketplaceQueryDto) {
    const data = await this.marketplace.findProducts(query);
    return { success: true, data };
  }

  @Get('products/best-sellers')
  async bestSellers(@Query() query: BestSellersQueryDto) {
    const data = await this.discovery.bestSellers(query);
    return { success: true, data };
  }

  @Get('umkm/products/featured')
  async featuredUmkmProducts(@Query() query: FeaturedQueryDto) {
    const data = await this.discovery.featuredUmkmProducts(query);
    return { success: true, data };
  }

  /// Didaftarkan SETELAH `products/featured` di controller yang sama, supaya
  /// "featured" tidak tertangkap sebagai `:id`.
  @Get('umkm/products/:id')
  async umkmProductDetail(@Param('id') id: string) {
    const data = await this.discovery.umkmProductDetail(id);
    return { success: true, data };
  }

  @Get('banners')
  async banners() {
    const data = await this.discovery.activeBanners();
    return { success: true, data };
  }
}

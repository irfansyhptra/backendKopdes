import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { StorageModule } from './storage/storage.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductModule } from './modules/product/product.module';
import { OrderModule } from './modules/order/order.module';
import { CartModule } from './modules/cart/cart.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { ContentModule } from './modules/content/content.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { KoperasiModule } from './modules/koperasi/koperasi.module';
import { UMKMModule } from './modules/umkm/umkm.module';
import { AIModule } from './modules/ai/ai.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AdminModule } from './modules/admin/admin.module';
import { CommunityModule } from './modules/community/community.module';
import { HealthModule } from './modules/health/health.module';
import { SellerModule } from './modules/seller/seller.module';
import { ChatModule } from './modules/chat/chat.module';
import { SuperAdminModule } from './modules/superadmin/superadmin.module';
import { AddressModule } from './modules/address/address.module';
import { StaffModule } from './modules/staff/staff.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ReviewModule } from './modules/review/review.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    DatabaseModule,
    CacheModule,
    StorageModule,
    QdrantModule,
    AuthModule,
    ProductModule,
    OrderModule,
    CartModule,
    DeliveryModule,
    UMKMModule,
    KoperasiModule,
    DiscoveryModule,
    ContentModule,
    SellerModule,
    AIModule,
    InventoryModule,
    AdminModule,
    CommunityModule,
    HealthModule,
    ChatModule,
    SuperAdminModule,
    AddressModule,
    StaffModule,
    PaymentModule,
    ReviewModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

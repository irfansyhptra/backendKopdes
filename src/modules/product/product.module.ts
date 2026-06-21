import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';
import { StorageModule } from '../../storage/storage.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

@Module({
  imports: [DatabaseModule, CacheModule, StorageModule, ConfigModule],
  controllers: [ProductController, CategoryController],
  providers: [ProductService, CategoryService],
  exports: [ProductService, CategoryService],
})
export class ProductModule {}

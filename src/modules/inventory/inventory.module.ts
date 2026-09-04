import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AdminInventoryController } from './admin-inventory.controller';
import { SellerInventoryController } from './seller-inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminInventoryController, SellerInventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}

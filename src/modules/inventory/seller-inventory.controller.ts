import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import {
  AdjustStockDto,
  ListTransactionsQueryDto,
  StockOpnameDto,
} from './dto/inventory.dto';

// Pengelolaan stok sisi mitra UMKM — dibatasi pada produk milik tokonya sendiri.
@Controller('seller/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.UMKM)
export class SellerInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('transactions')
  async transactions(@Req() req: any, @Query() query: ListTransactionsQueryDto) {
    const data = await this.inventoryService.listTransactionsForSeller(
      req.user.id,
      query,
    );
    return { success: true, ...data };
  }

  @Post('adjust')
  async adjust(@Req() req: any, @Body() dto: AdjustStockDto) {
    const data = await this.inventoryService.adjustStockForSeller(req.user.id, dto);
    return { success: true, message: 'Penyesuaian stok tercatat', data };
  }

  @Post('opname')
  async opname(@Req() req: any, @Body() dto: StockOpnameDto) {
    const data = await this.inventoryService.stockOpnameForSeller(req.user.id, dto);
    return { success: true, message: 'Stok opname tercatat', data };
  }
}

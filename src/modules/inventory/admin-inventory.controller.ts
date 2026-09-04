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

// Pengelolaan stok sisi Kopdes. Staf boleh menyentuh stok Kopdes maupun mitra.
@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class AdminInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('transactions')
  async transactions(@Query() query: ListTransactionsQueryDto) {
    const data = await this.inventoryService.listTransactions(query, null);
    return { success: true, ...data };
  }

  @Post('adjust')
  async adjust(@Req() req: any, @Body() dto: AdjustStockDto) {
    const data = await this.inventoryService.adjustStock(req.user.id, dto, null);
    return { success: true, message: 'Penyesuaian stok tercatat', data };
  }

  @Post('opname')
  async opname(@Req() req: any, @Body() dto: StockOpnameDto) {
    const data = await this.inventoryService.stockOpname(req.user.id, dto, null);
    return { success: true, message: 'Stok opname tercatat', data };
  }
}

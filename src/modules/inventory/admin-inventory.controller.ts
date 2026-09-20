import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';
import { Role } from '@prisma/client';
import {
  AdjustStockDto,
  ListTransactionsQueryDto,
  StockOpnameDto,
} from './dto/inventory.dto';

// Pengelolaan stok sisi Kopdes. Staf boleh menyentuh stok Kopdes maupun mitra
// yang bernaung di desanya — tidak di desa lain.
@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES, Role.SUPER_ADMIN)
export class AdminInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  private scope(req: AuthenticatedRequest): string | null {
    return req.user.kopdesId ?? null;
  }

  @Get('products')
  @RequirePermissions(Permission.INVENTORY_READ)
  async products(
    @Req() req: AuthenticatedRequest,
    @Query('filter') filter?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const allowed = ['all', 'low', 'out'] as const;
    const chosen = allowed.includes(filter as (typeof allowed)[number])
      ? (filter as (typeof allowed)[number])
      : 'all';
    const data = await this.inventoryService.listStock(
      this.scope(req),
      chosen,
      page,
      limit,
    );
    return { success: true, ...data };
  }

  @Get('transactions')
  @RequirePermissions(Permission.INVENTORY_READ)
  async transactions(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListTransactionsQueryDto,
  ) {
    const data = await this.inventoryService.listTransactions(
      query,
      null,
      this.scope(req),
    );
    return { success: true, ...data };
  }

  @Post('adjust')
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async adjust(@Req() req: AuthenticatedRequest, @Body() dto: AdjustStockDto) {
    const data = await this.inventoryService.adjustStock(
      req.user.id,
      dto,
      null,
      this.scope(req),
    );
    return { success: true, message: 'Penyesuaian stok tercatat', data };
  }

  @Post('opname')
  @RequirePermissions(Permission.INVENTORY_OPNAME)
  async opname(@Req() req: AuthenticatedRequest, @Body() dto: StockOpnameDto) {
    const data = await this.inventoryService.stockOpname(
      req.user.id,
      dto,
      null,
      this.scope(req),
    );
    return { success: true, message: 'Stok opname tercatat', data };
  }
}

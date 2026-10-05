import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../../common/permissions';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  KopdesProductQueryDto,
  UpdateKopdesProfileDto,
} from './dto/kopdes-console.dto';
import { KopdesConsoleService } from './kopdes-console.service';

@Controller('admin/kopdes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_KOPDES, Role.PEGAWAI_KOPDES)
export class KopdesConsoleController {
  constructor(private readonly console: KopdesConsoleService) {}

  @Get('profile')
  async profile(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.console.profile(req.user) };
  }

  /** Mengubah profil adalah keputusan pengurus, bukan tugas harian pegawai. */
  @Put('profile')
  @RequirePermissions(Permission.KOPDES_POLICY_MANAGE)
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateKopdesProfileDto,
  ) {
    return {
      success: true,
      data: await this.console.updateProfile(req.user, dto),
    };
  }

  @Put('profile/media')
  @RequirePermissions(Permission.KOPDES_POLICY_MANAGE)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: 1 },
      { name: 'banner', maxCount: 1 },
    ]),
  )
  async updateProfileMedia(
    @Req() req: AuthenticatedRequest,
    @UploadedFiles()
    files?: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
    },
  ) {
    return {
      success: true,
      data: await this.console.updateProfileMedia(req.user, files),
    };
  }

  @Get('dashboard')
  async dashboard(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.console.dashboard(req.user) };
  }

  @Get('products')
  @RequirePermissions(Permission.PRODUCT_READ)
  async products(
    @Req() req: AuthenticatedRequest,
    @Query() query: KopdesProductQueryDto,
  ) {
    return {
      success: true,
      data: await this.console.products(req.user, query),
    };
  }

  // Sebelum `products/:id` supaya "categories" tidak tertangkap sebagai id.
  @Get('products/categories')
  @RequirePermissions(Permission.PRODUCT_READ)
  async categories(@Req() req: AuthenticatedRequest) {
    return {
      success: true,
      data: await this.console.productCategories(req.user),
    };
  }

  @Get('products/:id')
  @RequirePermissions(Permission.PRODUCT_READ)
  async product(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { success: true, data: await this.console.product(req.user, id) };
  }
}

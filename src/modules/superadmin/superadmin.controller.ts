import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SuperAdminService } from './superadmin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import {
  CreateStaffDto,
  UpdateStaffDto,
  ListUsersQueryDto,
} from './dto/staff.dto';

// Seluruh endpoint khusus SUPER_ADMIN.
@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @Get('overview')
  async overview() {
    return { success: true, data: await this.service.overview() };
  }

  // ── Akun staf Kopdes ──
  @Get('accounts')
  async listStaff() {
    return { success: true, data: await this.service.listStaff() };
  }

  @Post('accounts')
  async createStaff(@Body() dto: CreateStaffDto) {
    return { success: true, data: await this.service.createStaff(dto) };
  }

  @Patch('accounts/:id')
  async updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return { success: true, data: await this.service.updateStaff(id, dto) };
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStaff(@Param('id') id: string) {
    await this.service.deleteStaff(id);
    return { success: true };
  }

  // ── Direktori pengguna ──
  @Get('users')
  async listUsers(@Query() query: ListUsersQueryDto) {
    return { success: true, data: await this.service.listUsers(query) };
  }
}

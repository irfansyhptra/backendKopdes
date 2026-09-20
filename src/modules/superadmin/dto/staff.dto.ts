import {
  IsArray,
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  IsIn,
} from 'class-validator';
import { Permission } from '../../../common/permissions';

const PERMISSION_VALUES = Object.values(Permission);
import { Role } from '@prisma/client';

export class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  // Divalidasi lagi di service agar hanya peran staf Kopdes.
  @IsEnum(Role)
  role!: Role;

  /// Kopdes penugasan. Wajib untuk staf desa — dicek di service.
  @IsString()
  @IsOptional()
  kopdesId?: string;

  /// Penyempitan permission. Kosong = pakai bawaan role.
  @IsArray()
  @IsIn(PERMISSION_VALUES, { each: true })
  @IsOptional()
  permissions?: string[];
}

export class UpdateStaffDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  kopdesId?: string;

  @IsArray()
  @IsIn(PERMISSION_VALUES, { each: true })
  @IsOptional()
  permissions?: string[];
}

export class ListUsersQueryDto {
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsString()
  @IsOptional()
  search?: string;
}

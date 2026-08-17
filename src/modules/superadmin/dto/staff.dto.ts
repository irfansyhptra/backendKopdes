import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
} from 'class-validator';
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
}

export class ListUsersQueryDto {
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsString()
  @IsOptional()
  search?: string;
}

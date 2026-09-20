import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../../../common/permissions';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Menandai handler dengan permission yang wajib dimiliki pemanggil.
 *
 * Dipakai bersama `PermissionsGuard`. Beberapa permission berarti "harus
 * punya semuanya" — bukan salah satu — supaya penambahan permission kedua
 * pada sebuah endpoint tidak diam-diam memperlonggar aksesnya.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

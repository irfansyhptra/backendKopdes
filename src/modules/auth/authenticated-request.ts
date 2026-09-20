import { Role } from '@prisma/client';
import { PermissionKey } from '../../common/permissions';

/**
 * Bentuk `req.user` setelah `JwtAuthGuard` dan `PermissionsGuard` berjalan.
 *
 * `kopdesId` dan `permissions` baru terisi setelah `PermissionsGuard` ikut
 * dipasang pada handler — controller yang menyaring data per desa wajib
 * memakainya, bukan mengandalkan klaim token.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  kopdesId: string | null;
  permissions: PermissionKey[];
}

export interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

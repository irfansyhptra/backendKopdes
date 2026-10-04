import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  /**
   * Minimal 8 karakter dengan huruf dan angka — lebih ketat dari pendaftaran
   * (minimal 6), karena kata sandi yang diganti sengaja harus lebih kuat.
   */
  @IsString()
  @MinLength(8, { message: 'Kata sandi baru minimal 8 karakter.' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Kata sandi baru harus memuat huruf dan angka.',
  })
  newPassword!: string;
}

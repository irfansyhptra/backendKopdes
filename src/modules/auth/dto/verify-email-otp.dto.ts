import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class VerifyEmailOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Kode OTP harus terdiri dari 6 angka.' })
  code!: string;
}

export class ResendEmailOtpDto {
  @IsEmail()
  email!: string;
}

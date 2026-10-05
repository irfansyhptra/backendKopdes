import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  ResendEmailOtpDto,
  VerifyEmailOtpDto,
} from './dto/verify-email-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto) {
    const data = await this.authService.register(dto);
    return { success: true, data };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() dto: VerifyEmailOtpDto) {
    const data = await this.authService.verifyCustomerEmail(
      dto.email,
      dto.code,
    );
    return { success: true, data };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resendVerification(@Body() dto: ResendEmailOtpDto) {
    const data = await this.authService.resendCustomerEmailOtp(dto.email);
    return { success: true, data };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const data = await this.authService.login(dto);
    return { success: true, data };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    const data = await this.authService.refresh(refreshToken);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req: any) {
    const data = await this.authService.me(req.user.id);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @Request() req: any,
    @Body('name') name: string,
    @Body('phone') phone?: string,
  ) {
    const data = await this.authService.updateProfile(req.user.id, {
      name,
      phone,
    });
    return { success: true, data };
  }

  /**
   * Mengganti kata sandi. Semua sesi lain ikut keluar; perangkat ini menerima
   * token baru sehingga tidak perlu masuk ulang.
   */
  @UseGuards(JwtAuthGuard)
  @Put('password')
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    const data = await this.authService.changePassword(req.user.id, dto);
    return { success: true, data };
  }
}

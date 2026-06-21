import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { SeedService } from './seed.service';

@Controller('admin/seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async seed() {
    const data = await this.seedService.seed();
    return { success: true, ...data };
  }
}

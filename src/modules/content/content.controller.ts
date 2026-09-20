import { Controller, Get, Param } from '@nestjs/common';

import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const data = await this.content.findBySlug(slug);
    return { success: true, data };
  }
}

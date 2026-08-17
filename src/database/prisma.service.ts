import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    try {
      await this.$executeRawUnsafe(`
        ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isPreOrderAllowed" BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "preOrderAvailableAt" TIMESTAMP(3);
        ALTER TABLE "UMKMProduct" ADD COLUMN IF NOT EXISTS "isPreOrderAllowed" BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE "UMKMProduct" ADD COLUMN IF NOT EXISTS "preOrderAvailableAt" TIMESTAMP(3);
      `);
    } catch {
      // Ignore if execution fails due to permissions or early startup
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

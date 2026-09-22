import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      // The built-in database accepts one connection at a time, so right after a restart the previous
      // process may still hold it. Retry for a while instead of giving up on the first refusal.
      for (let attempt = 1; ; attempt++) {
        try {
          await this.$connect();
          break;
        } catch (err) {
          if (attempt >= 8) throw err;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      await this.ensureSchema();
    } catch (err) {
      // The API still boots so /health can report the database problem clearly.
      this.logger.error({ event: 'db.connect_failed', error: (err as Error).message });
    }
  }

  /**
   * Small additive database changes are applied here as well as by the migration files, so an upgrade
   * works with the built-in database too (it cannot run `prisma migrate`). Every statement is idempotent.
   */
  private async ensureSchema() {
    await this.$executeRawUnsafe('ALTER TABLE "CVProfile" ADD COLUMN IF NOT EXISTS "textContent" TEXT');
    await this.$executeRawUnsafe('ALTER TABLE "CVProfile" ADD COLUMN IF NOT EXISTS "experienceYears" DOUBLE PRECISION');
    await this.$executeRawUnsafe('ALTER TABLE "JobAnalysis" ADD COLUMN IF NOT EXISTS "whatsappNotifiedAt" TIMESTAMP(3)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}

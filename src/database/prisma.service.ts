import { PrismaPg } from '@prisma/adapter-pg';
import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { DATABASE_CONFIG } from '../config/config.module';
import type { DatabaseConfig } from '../config/database.config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(DATABASE_CONFIG) config: DatabaseConfig) {
    const adapter = new PrismaPg({ connectionString: config.url });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

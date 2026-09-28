import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { DATABASE_OPTIONS } from './database.constants';
import type { DatabaseModuleOptions } from './database.module';

function resolveConnectionString(options: DatabaseModuleOptions): string {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and provide a value.');
  }
  return connectionString;
}

// Single managed Prisma client for the whole API process (Prisma 7 driver adapter).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DATABASE_OPTIONS) options: DatabaseModuleOptions) {
    super({ adapter: new PrismaPg({ connectionString: resolveConnectionString(options) }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

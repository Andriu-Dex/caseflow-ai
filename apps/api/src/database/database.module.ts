import { Global, Module, type DynamicModule } from '@nestjs/common';
import { DATABASE_OPTIONS } from './database.constants';
import { PrismaService } from './prisma.service';

export interface DatabaseModuleOptions {
  // Defaults to the DATABASE_URL environment variable. Integration tests pass
  // DATABASE_TEST_URL explicitly.
  connectionString?: string;
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions = {}): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: DATABASE_OPTIONS, useValue: options }, PrismaService],
      exports: [PrismaService],
    };
  }
}

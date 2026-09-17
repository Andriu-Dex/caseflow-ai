import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

describe('Worker AppModule', () => {
  it('initializes a Nest application context without an HTTP server', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef).toBeDefined();

    await moduleRef.close();
  });
});

import type { NestExpressApplication } from '@nestjs/platform-express';

// A source's text may hold 500 000 characters (DEC-127); encoded as JSON it
// can take about 2 MB. Express accepts only 100 KB by default.
export const JSON_BODY_LIMIT = '3mb';

export function configureBodyLimits(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
}

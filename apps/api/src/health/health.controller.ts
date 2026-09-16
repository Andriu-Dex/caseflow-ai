import { Controller, Get } from '@nestjs/common';
import type { HealthLiveResponse } from '@caseflow-ai/contracts';

@Controller('health')
export class HealthController {
  @Get('live')
  getLiveness(): HealthLiveResponse {
    return { status: 'ok' };
  }
}

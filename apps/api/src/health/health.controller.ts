import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { healthLiveResponseSchema, type HealthLiveResponse } from '@caseflow-ai/contracts';
import { ApiZodResponse } from '../openapi/zod-openapi';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get('live')
  @ApiOperation({
    operationId: 'getHealthLive',
    summary: 'Liveness probe',
    description: 'Reports that the API process is running. It does not check dependencies.',
  })
  @ApiZodResponse(200, 'The API process is alive.', healthLiveResponseSchema)
  getLiveness(): HealthLiveResponse {
    return { status: 'ok' };
  }
}

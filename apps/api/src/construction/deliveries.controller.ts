import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  approveDeliveryRequestSchema,
  createDeliveryPlanRequestSchema,
  deliveryPlanResponseSchema,
  saveDeliveryPlanRequestSchema,
} from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiErrorResponse, ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { DeliveriesService } from './deliveries.service';

interface AuthenticatedRequest {
  user: { id: string };
}

// ADR-024: construction by deliveries, one plan of deliveries per approved
// implementation plan version.
@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/implementation-plans/:versionId/delivery-plan')
export class DeliveriesController {
  constructor(private readonly service: DeliveriesService) {}

  @Get()
  @ApiOperation({ operationId: 'getDeliveryPlan', summary: 'Get the plan of deliveries' })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('versionId', 'Approved implementation plan version.')
  @ApiZodResponse(200, 'The deliveries with their modules and status.', deliveryPlanResponseSchema)
  @ApiErrorResponse(404, 'The plan has no plan of deliveries yet.')
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
  ) {
    return this.service.get(projectId, versionId);
  }

  @Post()
  @ApiOperation({
    operationId: 'createDeliveryPlan',
    summary: 'Create the plan of deliveries, with the proposed order unless one is given',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('versionId', 'Approved implementation plan version.')
  @ApiZodBody(createDeliveryPlanRequestSchema)
  @ApiZodResponse(201, 'The plan of deliveries.', deliveryPlanResponseSchema)
  @ApiErrorResponse(409, 'The plan already has a plan of deliveries.')
  @ApiErrorResponse(422, 'The plan is not approved or the order cannot be built.')
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(createDeliveryPlanRequestSchema))
    body: z.output<typeof createDeliveryPlanRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.create(projectId, req.user.id, versionId, body);
  }

  @Put()
  @ApiOperation({
    operationId: 'saveDeliveryPlan',
    summary: 'Reorder or regroup the deliveries not generated yet',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('versionId', 'Approved implementation plan version.')
  @ApiZodBody(saveDeliveryPlanRequestSchema)
  @ApiZodResponse(200, 'The plan of deliveries.', deliveryPlanResponseSchema)
  @ApiErrorResponse(422, 'The order cannot be built or changes a generated delivery.')
  save(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(saveDeliveryPlanRequestSchema))
    body: z.output<typeof saveDeliveryPlanRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.save(projectId, req.user.id, versionId, body);
  }

  @Post('deliveries/:deliveryId/approval')
  @ApiOperation({
    operationId: 'approveDelivery',
    summary: 'Approve a validated run of a delivery, after the earlier ones',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('versionId', 'Approved implementation plan version.')
  @ApiUuidParam('deliveryId', 'Delivery to approve.')
  @ApiZodBody(approveDeliveryRequestSchema)
  @ApiZodResponse(201, 'The plan of deliveries.', deliveryPlanResponseSchema)
  @ApiErrorResponse(409, 'The delivery is already approved.')
  @ApiErrorResponse(
    422,
    'The run is not validated, does not build it, or an earlier one is pending.',
  )
  approve(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Param('deliveryId', uuidParamPipe) deliveryId: string,
    @Body(new ZodValidationPipe(approveDeliveryRequestSchema))
    body: z.output<typeof approveDeliveryRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.approve(projectId, req.user.id, versionId, deliveryId, body);
  }
}

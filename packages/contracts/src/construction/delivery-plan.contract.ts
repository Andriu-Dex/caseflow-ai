import { z } from 'zod';

// ADR-024: construction by deliveries.
// The status is derived from the delivery's runs and approvals, never stored.
export const DELIVERY_STATUSES = ['PENDING', 'GENERATED', 'APPROVED', 'AFFECTED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const moduleLocalId = z.string().trim().min(1).max(80);

// The order the person chooses: the modules of each delivery, delivery 0 first.
export const saveDeliveryPlanRequestSchema = z
  .object({
    deliveries: z
      .array(z.object({ modules: z.array(moduleLocalId).min(1).max(40) }).strict())
      .min(1)
      .max(40),
  })
  .strict();
export type SaveDeliveryPlanRequest = z.infer<typeof saveDeliveryPlanRequestSchema>;
// Without deliveries, CASEFlow proposes the order (dependencies first).
export const createDeliveryPlanRequestSchema = saveDeliveryPlanRequestSchema.partial().strict();
export type CreateDeliveryPlanRequest = z.infer<typeof createDeliveryPlanRequestSchema>;

export const deliveryResponseSchema = z.object({
  id: z.uuid(),
  position: z.number().int().min(0),
  name: z.string(),
  status: z.enum(DELIVERY_STATUSES),
  // Generated or approved: its modules and place no longer change.
  locked: z.boolean(),
  modules: z.array(z.object({ localId: z.string(), name: z.string(), description: z.string() })),
});
export type DeliveryResponse = z.infer<typeof deliveryResponseSchema>;

export const deliveryPlanResponseSchema = z.object({
  id: z.uuid(),
  implementationPlanVersionId: z.uuid(),
  createdAt: z.iso.datetime(),
  deliveries: z.array(deliveryResponseSchema),
  // Why a module has to be built after another, to explain the order.
  dependencies: z.array(z.object({ module: z.string(), needs: z.string(), reason: z.string() })),
});
export type DeliveryPlanResponse = z.infer<typeof deliveryPlanResponseSchema>;

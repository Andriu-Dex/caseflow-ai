'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { ConstructionState } from './stage-links';

export function useConstructionState(projectId?: string): {
  data: ConstructionState | undefined;
  isLoading: boolean;
} {
  const generationPlanQuery = useQuery({
    queryKey: ['structured-analysis', 'GENERATION_PLAN', projectId],
    queryFn: async () => {
      try {
        return (
          (await api.structuredAnalysis?.list?.(projectId!, 'GENERATION_PLAN')) ?? { items: [] }
        );
      } catch {
        return { items: [] };
      }
    },
    enabled: Boolean(projectId),
  });

  const conceptualModelQuery = useQuery({
    queryKey: ['structured-analysis', 'CONCEPTUAL_DOMAIN_MODEL', projectId],
    queryFn: async () => {
      try {
        return (
          (await api.structuredAnalysis?.list?.(projectId!, 'CONCEPTUAL_DOMAIN_MODEL')) ?? {
            items: [],
          }
        );
      } catch {
        return { items: [] };
      }
    },
    enabled: Boolean(projectId),
  });

  const designBaselinesQuery = useQuery({
    queryKey: ['design-baselines', projectId],
    queryFn: async () => {
      try {
        return (await api.designBaselines?.list?.(projectId!)) ?? { items: [] };
      } catch {
        return { items: [] };
      }
    },
    enabled: Boolean(projectId),
  });

  const implementationPlanQuery = useQuery({
    queryKey: ['structured-analysis', 'IMPLEMENTATION_PLAN', projectId],
    queryFn: async () => {
      try {
        return (
          (await api.structuredAnalysis?.list?.(projectId!, 'IMPLEMENTATION_PLAN')) ?? { items: [] }
        );
      } catch {
        return { items: [] };
      }
    },
    enabled: Boolean(projectId),
  });

  const generationRunsQuery = useQuery({
    queryKey: ['generation-runs', projectId],
    queryFn: async () => {
      try {
        return (await api.generationRuns?.list?.(projectId!)) ?? { items: [] };
      } catch {
        return { items: [] };
      }
    },
    enabled: Boolean(projectId),
  });

  const isLoading =
    generationPlanQuery.isLoading ||
    conceptualModelQuery.isLoading ||
    designBaselinesQuery.isLoading ||
    implementationPlanQuery.isLoading ||
    generationRunsQuery.isLoading;

  const data: ConstructionState | undefined = projectId
    ? {
        hasApprovedGenerationPlan: Boolean(
          generationPlanQuery.data?.items?.some((p) => p.version.status === 'APPROVED'),
        ),
        hasApprovedConceptualModel: Boolean(
          conceptualModelQuery.data?.items?.some((p) => p.version.status === 'APPROVED'),
        ),
        hasDesignBaseline: Boolean((designBaselinesQuery.data?.items?.length ?? 0) > 0),
        hasApprovedImplementationPlan: Boolean(
          implementationPlanQuery.data?.items?.some((p) => p.version.status === 'APPROVED'),
        ),
        hasGeneratedCode: Boolean(
          generationRunsQuery.data?.items?.some((r) => r.status === 'GENERATED'),
        ),
      }
    : undefined;

  return { data, isLoading };
}

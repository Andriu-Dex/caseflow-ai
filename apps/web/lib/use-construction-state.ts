'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { ConstructionState } from './stage-links';
import { newestApprovedPlan, newestRunForPlan } from './construction-progress';

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

  const approvedPlan = newestApprovedPlan(implementationPlanQuery.data?.items ?? []);
  const latestRun = newestRunForPlan(
    generationRunsQuery.data?.items ?? [],
    approvedPlan?.version.id,
  );
  const validation = useQuery({
    queryKey: ['sandbox-runs', projectId, latestRun?.id],
    queryFn: async () =>
      (await api.generationRuns?.sandboxRuns?.(projectId!, latestRun!.id)) ?? { items: [] },
    enabled: Boolean(projectId && latestRun?.status === 'GENERATED'),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'QUEUED' || item.status === 'RUNNING')
        ? 2000
        : false,
  });
  const latestValidation = [...(validation.data?.items ?? [])].sort(
    (a, b) => b.attemptNumber - a.attemptNumber,
  )[0];

  const isLoading =
    generationPlanQuery.isLoading ||
    conceptualModelQuery.isLoading ||
    designBaselinesQuery.isLoading ||
    implementationPlanQuery.isLoading ||
    generationRunsQuery.isLoading ||
    validation.isLoading;

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
        hasGeneratedCode: latestRun?.status === 'GENERATED',
        hasValidatedCode:
          latestRun?.status === 'GENERATED' &&
          latestValidation?.status === 'READY' &&
          Boolean(latestValidation.snapshotId),
      }
    : undefined;

  return { data, isLoading };
}

type PlanVersion = {
  version: { id?: string; status: string; createdAt?: string };
  createdAt?: string;
};

const timestamp = (value?: string) => (value ? Date.parse(value) || 0 : 0);

export function newestApprovedPlan<T extends PlanVersion>(plans: readonly T[]): T | undefined {
  return [...plans]
    .filter((plan) => plan.version.status === 'APPROVED')
    .sort(
      (a, b) =>
        timestamp(b.version.createdAt ?? b.createdAt) -
          timestamp(a.version.createdAt ?? a.createdAt) ||
        (b.version.id ?? '').localeCompare(a.version.id ?? ''),
    )[0];
}

export function newestRunForPlan<
  T extends { id: string; createdAt?: string; implementationPlanVersionId: string },
>(runs: readonly T[], planVersionId?: string): T | undefined {
  if (!planVersionId) return undefined;
  return [...runs]
    .filter((run) => run.implementationPlanVersionId === planVersionId)
    .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt) || b.id.localeCompare(a.id))[0];
}

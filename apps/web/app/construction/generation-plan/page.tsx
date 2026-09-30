'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function GenerationPlanPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage
          kind="GENERATION_PLAN"
          title="Plan de generación"
          projectId={projectId}
        />
      )}
    </RequireActiveProject>
  );
}

'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function ImplementationPlanPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage
          kind="IMPLEMENTATION_PLAN"
          title="Plan de implementación"
          projectId={projectId}
        />
      )}
    </RequireActiveProject>
  );
}

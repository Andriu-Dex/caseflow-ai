'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { ConstructionFooter } from '../../../components/construction-footer';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function ImplementationPlanPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <div className="flex flex-col gap-6">
          <StructuredKindPage
            kind="IMPLEMENTATION_PLAN"
            title="Plan de implementación"
            projectId={projectId}
          />

          <ConstructionFooter projectId={projectId} step={4} />
        </div>
      )}
    </RequireActiveProject>
  );
}

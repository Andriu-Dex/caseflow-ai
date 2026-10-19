'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { ConstructionFooter } from '../../../components/construction-footer';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function GenerationPlanPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <div className="flex flex-col gap-6">
          <StructuredKindPage
            kind="GENERATION_PLAN"
            title="Plan de generación"
            projectId={projectId}
          />

          <ConstructionFooter projectId={projectId} step={1} />
        </div>
      )}
    </RequireActiveProject>
  );
}

'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function ConceptualModelPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <div className="flex flex-col gap-6">
          <StructuredKindPage
            kind="CONCEPTUAL_DOMAIN_MODEL"
            title="Modelo conceptual"
            projectId={projectId}
          />
        </div>
      )}
    </RequireActiveProject>
  );
}

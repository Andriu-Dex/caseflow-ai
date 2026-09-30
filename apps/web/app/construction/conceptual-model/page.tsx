'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function ConceptualModelPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage
          kind="CONCEPTUAL_DOMAIN_MODEL"
          title="Modelo conceptual"
          projectId={projectId}
        />
      )}
    </RequireActiveProject>
  );
}

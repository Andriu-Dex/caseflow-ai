'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function SoftwareArchitecturePage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage
          kind="SOFTWARE_ARCHITECTURE"
          title="Arquitectura de software"
          projectId={projectId}
        />
      )}
    </RequireActiveProject>
  );
}

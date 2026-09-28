'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function SystemArchitecturePage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage
          kind="SYSTEM_ARCHITECTURE"
          title="Arquitectura de sistema"
          projectId={projectId}
        />
      )}
    </RequireActiveProject>
  );
}

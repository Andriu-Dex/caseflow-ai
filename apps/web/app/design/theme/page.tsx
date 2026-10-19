'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function DesignThemePage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage kind="DESIGN_THEME" title="Tema y colores" projectId={projectId} />
      )}
    </RequireActiveProject>
  );
}

'use client';

import { RequireActiveProject } from '../../components/query-state';
import { StructuredKindPage } from '../../components/structured-kind-page';

export default function ClassDiagramPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage kind="CLASS_DIAGRAM" title="Diagrama de clases" projectId={projectId} />
      )}
    </RequireActiveProject>
  );
}

'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function NavigationPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage kind="NAVIGATION_TREE" title="Navegación" projectId={projectId} />
      )}
    </RequireActiveProject>
  );
}

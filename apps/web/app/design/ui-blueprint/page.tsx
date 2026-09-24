'use client';

import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function UiBlueprintPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <StructuredKindPage kind="UI_BLUEPRINT" title="UI Blueprint" projectId={projectId} />
      )}
    </RequireActiveProject>
  );
}

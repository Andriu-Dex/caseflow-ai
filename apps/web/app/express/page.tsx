'use client';

import { RequireActiveProject } from '../../components/query-state';
import { WorkflowRunPanel } from '../../components/workflow-run-panel';

// EXPRESS route (DEC-116, DEC-119): generated planning and its bulk reviews.
export default function ExpressPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <WorkflowRunPanel projectId={projectId} title="Asistente Exprés" />}
    </RequireActiveProject>
  );
}

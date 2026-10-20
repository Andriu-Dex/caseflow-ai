'use client';

import { RequireActiveProject } from '../../components/query-state';
import { WorkflowRunPanel } from '../../components/workflow-run-panel';

// BUILD_ONLY route (DEC-116): the prompt, progress and result.
export default function BuildPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <WorkflowRunPanel projectId={projectId} title="Construcción automática" />}
    </RequireActiveProject>
  );
}

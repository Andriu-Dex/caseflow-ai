import { AlertCircle, FolderKanban } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@caseflow-ai/ui';
import { ApiError } from '../lib/api';
import { useActiveProject } from '../lib/active-project';

// Standard loading/empty/error handling for every primary page (spec Phase I
// "Loading / empty / error states"): translates normalized ApiError into a
// short user-facing message, never a raw stack trace.
export function QueryState({
  isLoading,
  error,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-live="polite" aria-busy="true">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (error) {
    const message = error instanceof ApiError ? error.message : 'Ocurrió un error inesperado.';
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
    );
  }
  return <>{children}</>;
}

export function NoActiveProject() {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-4 text-sm text-muted-foreground">
      <FolderKanban className="size-4 shrink-0" aria-hidden="true" />
      Seleccione o cree un proyecto para continuar.
    </div>
  );
}

export function RequireActiveProject({ children }: { children: (projectId: string) => ReactNode }) {
  const { projectId } = useActiveProject();
  if (!projectId) return <NoActiveProject />;
  return <>{children(projectId)}</>;
}

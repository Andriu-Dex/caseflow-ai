import type { ReactNode } from 'react';
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
  if (isLoading) return <p className="text-sm text-gray-500">Cargando…</p>;
  if (error) {
    const message = error instanceof ApiError ? error.message : 'Ocurrió un error inesperado.';
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {message}
      </div>
    );
  }
  return <>{children}</>;
}

export function NoActiveProject() {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
      Seleccione o cree un proyecto para continuar.
    </div>
  );
}

export function RequireActiveProject({ children }: { children: (projectId: string) => ReactNode }) {
  const { projectId } = useActiveProject();
  if (!projectId) return <NoActiveProject />;
  return <>{children(projectId)}</>;
}

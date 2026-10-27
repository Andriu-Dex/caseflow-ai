'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import type { EditUserManualRequest, UserManualResponse } from '@caseflow-ai/contracts';
import { api, ApiError } from '../../../lib/api';
import { RequireActiveProject } from '../../../components/query-state';
import { AuthedDownloadButton } from '../../../components/authed-media';

export function ManualEditor({
  manual,
  busy,
  save,
  onDirtyChange,
}: {
  manual: UserManualResponse;
  busy: boolean;
  save: (input: EditUserManualRequest) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<EditUserManualRequest>({
    expectedVersionId: manual.version.id,
    introduction: manual.introduction,
    tasks: manual.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      verified: task.verified,
      steps: task.steps.map((step) => ({ ...step })),
    })),
  });
  const updateTask = (index: number, patch: Partial<EditUserManualRequest['tasks'][number]>) => {
    onDirtyChange?.(true);
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)),
    }));
  };
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft);
      }}
    >
      <label className="block">
        Introducción
        <textarea
          className="mt-1 min-h-24 w-full rounded border bg-background p-3"
          maxLength={2000}
          required
          value={draft.introduction}
          onChange={(event) => {
            onDirtyChange?.(true);
            setDraft({
              ...draft,
              introduction: event.target.value,
              tasks: draft.tasks.map((task) => ({ ...task, verified: false })),
            });
          }}
        />
      </label>
      {draft.tasks.map((task, index) => (
        <section className="rounded-xl border bg-card p-5" key={task.id}>
          <p className="mb-2 text-sm text-muted-foreground">
            {manual.tasks[index]!.roles.join(' · ') || 'Usuario autorizado'} ·{' '}
            {manual.tasks[index]!.routePath}
          </p>
          <label className="block">
            Tarea {index + 1}
            <input
              className="mt-1 w-full rounded border bg-background p-2 font-semibold"
              value={task.title}
              required
              maxLength={200}
              onChange={(event) =>
                updateTask(index, { title: event.target.value, verified: false })
              }
            />
          </label>
          <p className="my-3 text-sm text-muted-foreground">
            Esquema del flujo. No es una captura de la aplicación.
          </p>
          <ol className="space-y-3">
            {task.steps.map((step, stepIndex) => (
              <li className="flex gap-3 rounded-lg border p-3" key={stepIndex}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {stepIndex + 1}
                </span>
                <div className="w-full space-y-2">
                  <label className="block">
                    Instrucción {stepIndex + 1}
                    <textarea
                      className="w-full rounded border bg-background p-2"
                      value={step.instruction}
                      required
                      maxLength={1000}
                      onChange={(event) =>
                        updateTask(index, {
                          verified: false,
                          steps: task.steps.map((item, i) =>
                            i === stepIndex ? { ...item, instruction: event.target.value } : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="block">
                    Qué comprobar
                    <textarea
                      className="w-full rounded border bg-background p-2"
                      value={step.expectedResult}
                      required
                      maxLength={1000}
                      onChange={(event) =>
                        updateTask(index, {
                          verified: false,
                          steps: task.steps.map((item, i) =>
                            i === stepIndex
                              ? { ...item, expectedResult: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={task.steps.length <= 1}
                    onClick={() =>
                      updateTask(index, {
                        verified: false,
                        steps: task.steps.filter((_, i) => i !== stepIndex),
                      })
                    }
                  >
                    Quitar paso
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <Button
            className="my-3"
            type="button"
            variant="outline"
            disabled={task.steps.length >= 24}
            onClick={() =>
              updateTask(index, {
                verified: false,
                steps: [...task.steps, { instruction: '', expectedResult: '' }],
              })
            }
          >
            Añadir paso
          </Button>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={task.verified}
              onChange={(event) => updateTask(index, { verified: event.target.checked })}
            />
            He comprobado estos pasos en la aplicación correspondiente a esta entrega.
          </label>
        </section>
      ))}
      <Button type="submit" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar nueva versión'}
      </Button>
    </form>
  );
}

function ManualContent({ projectId, snapshotId }: { projectId: string; snapshotId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const state = useQuery({
    queryKey: ['user-manual', projectId, snapshotId],
    queryFn: () => api.userManuals.state(projectId, snapshotId),
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : false,
  });
  const historical = useQuery({
    queryKey: ['user-manual-version', projectId, snapshotId, selectedVersion],
    queryFn: () => api.userManuals.version(projectId, snapshotId, selectedVersion),
    enabled: Boolean(selectedVersion),
  });
  const manual = selectedVersion ? historical.data : state.data?.manual;
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setIsDirty(false);
      setSelectedVersion('');
      await queryClient.invalidateQueries({ queryKey: ['user-manual', projectId, snapshotId] });
      toast.success('Manual actualizado.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };
  if (state.isLoading) return <p role="status">Cargando manual…</p>;
  if (state.isError)
    return (
      <div role="alert">
        <p>No se pudo consultar esta entrega.</p>
        <Button onClick={() => void state.refetch()}>Reintentar</Button>
      </div>
    );
  const generating = ['QUEUED', 'RUNNING'].includes(state.data?.job?.status ?? '');
  if (selectedVersion && historical.isLoading) return <p role="status">Cargando versión…</p>;
  if (selectedVersion && historical.isError)
    return (
      <div role="alert">
        <p>No se pudo cargar la versión elegida.</p>
        <Button onClick={() => setSelectedVersion('')}>Volver a la última versión</Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <Link href="/construction/generation-runs" className="text-primary underline">
        Volver a proyectos generados
      </Link>
      <h1 className="text-2xl font-semibold">Manual de usuario y entrega</h1>
      <p>
        El manual pertenece a esta versión del software. Revise las instrucciones en la aplicación
        antes de aprobar. Los esquemas no acreditan que una función haya sido probada.
      </p>
      {state.data?.job?.errorMessage ? (
        <p role="alert" className="rounded border p-3">
          {state.data.job.errorMessage}
        </p>
      ) : null}
      {!manual ? (
        <div className="rounded border p-5">
          <p role="status">
            {generating ? 'Generando el manual visual…' : 'Esta entrega aún no tiene manual.'}
          </p>
          <Button
            disabled={busy || generating}
            onClick={() => void act(() => api.userManuals.generate(projectId, snapshotId))}
          >
            {generating ? 'Generando…' : 'Generar o reintentar manual'}
          </Button>
        </div>
      ) : (
        <>
          {!manual.isCurrent ? (
            <p role="alert" className="rounded border p-3">
              Existe una entrega más reciente. Este manual documenta una versión anterior.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <strong>
              {manual.code} · v{manual.version.versionNumber} ·{' '}
              {manual.version.status === 'APPROVED' ? 'Aprobado' : 'Pendiente de revisión'}
            </strong>
            <label>
              Historial{' '}
              <select
                disabled={isDirty || busy}
                className="rounded border bg-background p-2"
                value={selectedVersion}
                onChange={(event) => setSelectedVersion(event.target.value)}
              >
                <option value="">Última versión</option>
                {manual.history.map((version) => (
                  <option value={version.id} key={version.id}>
                    Versión {version.versionNumber}
                  </option>
                ))}
              </select>
            </label>
            {(['html', 'pdf'] as const).map((format) => (
              <AuthedDownloadButton
                disabled={isDirty}
                key={format}
                className="rounded border px-3 py-2"
                url={api.userManuals.downloadUrl(projectId, snapshotId, manual.version.id, format)}
                filename={`manual-v${manual.version.versionNumber}.${format}`}
              >
                Descargar {format.toUpperCase()}
                {manual.version.status === 'APPROVED' ? '' : ' (borrador)'}
              </AuthedDownloadButton>
            ))}
            {manual.version.status === 'APPROVED' ? (
              <AuthedDownloadButton
                disabled={isDirty}
                className="rounded border px-3 py-2"
                url={api.userManuals.downloadUrl(projectId, snapshotId, manual.version.id, 'zip')}
                filename={`entrega-${snapshotId}.zip`}
              >
                Descargar software y manual
              </AuthedDownloadButton>
            ) : null}
          </div>
          {historical.isError ? <p role="alert">No se pudo cargar la versión elegida.</p> : null}
          {selectedVersion ? (
            <div>
              <p>{manual.introduction}</p>
              {manual.tasks.map((task) => (
                <section className="my-4 rounded border p-4" key={task.id}>
                  <h2>{task.title}</h2>
                  <ol className="list-decimal pl-5">
                    {task.steps.map((step, index) => (
                      <li key={index}>
                        {step.instruction}
                        <p className="text-muted-foreground">{step.expectedResult}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <>
              {isDirty ? (
                <div role="status" className="rounded border p-3">
                  <p>Hay cambios sin guardar. Guárdelos antes de revisar, aprobar o descargar.</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDirty(false);
                      setEditorEpoch((value) => value + 1);
                    }}
                  >
                    Descartar cambios sin guardar
                  </Button>
                </div>
              ) : null}
              <ManualEditor
                key={`${manual.version.id}:${editorEpoch}`}
                manual={manual}
                busy={busy}
                onDirtyChange={setIsDirty}
                save={(input) => act(() => api.userManuals.edit(projectId, snapshotId, input))}
              />
              <div className="flex gap-3">
                {['DRAFT', 'GENERATED', 'CHANGES_REQUESTED'].includes(manual.version.status) ? (
                  <Button
                    disabled={busy || isDirty}
                    onClick={() =>
                      void act(() =>
                        api.userManuals.transition(
                          projectId,
                          snapshotId,
                          manual.version.id,
                          'IN_REVIEW',
                        ),
                      )
                    }
                  >
                    Enviar a revisión
                  </Button>
                ) : null}
                {manual.version.status === 'IN_REVIEW' ? (
                  <>
                    <Button
                      disabled={busy || isDirty || !manual.tasks.every((task) => task.verified)}
                      onClick={() =>
                        void act(() =>
                          api.userManuals.transition(
                            projectId,
                            snapshotId,
                            manual.version.id,
                            'APPROVED',
                          ),
                        )
                      }
                    >
                      Aprobar manual
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || isDirty}
                      onClick={() =>
                        void act(() =>
                          api.userManuals.transition(
                            projectId,
                            snapshotId,
                            manual.version.id,
                            'CHANGES_REQUESTED',
                          ),
                        )
                      }
                    >
                      Solicitar cambios
                    </Button>
                  </>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SelectedManual() {
  const snapshotId = useSearchParams().get('snapshotId');
  if (!snapshotId) return <p>Seleccione una entrega validada desde Proyectos generados.</p>;
  return (
    <RequireActiveProject>
      {(projectId) => (
        <ManualContent
          key={`${projectId}:${snapshotId}`}
          projectId={projectId}
          snapshotId={snapshotId}
        />
      )}
    </RequireActiveProject>
  );
}
export default function UserManualPage() {
  return (
    <Suspense fallback={<p>Cargando…</p>}>
      <SelectedManual />
    </Suspense>
  );
}

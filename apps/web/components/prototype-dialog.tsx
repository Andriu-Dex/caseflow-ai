'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Folder } from 'lucide-react';
import { useState } from 'react';
import type { MockupPreviewResponse, StructuredAnalysisResponse } from '@caseflow-ai/contracts';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@caseflow-ai/ui';
import { api, fetchBlob } from '../lib/api';
import { buildPrototype, forRole, rolesOf, type PrototypeNode } from '../lib/prototype';

type Tree = { nodes: { localId: string; label: string; parentLocalId?: string }[] };
type Blueprint = { screens: Parameters<typeof buildPrototype>[1] };

const approved = (items: StructuredAnalysisResponse[] | undefined) =>
  (items ?? []).filter((item) => item.version.status === 'APPROVED');

// DEC-175: the approved mockup walked through as a prototype: the navigation
// tree on the side, by role, and the real screen in an isolated frame (its
// HTML is project content: no scripts and no access to the page).
export function PrototypeDialog({
  open,
  onOpenChange,
  projectId,
  mockup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  mockup: MockupPreviewResponse;
}) {
  const tree = useQuery({
    queryKey: ['structured-analysis', 'NAVIGATION_TREE', projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, 'NAVIGATION_TREE'),
    enabled: open,
  });
  const blueprints = useQuery({
    queryKey: ['structured-analysis', 'UI_BLUEPRINT', projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, 'UI_BLUEPRINT'),
    enabled: open,
  });
  const blueprint =
    blueprints.data?.items.find((item) => item.version.id === mockup.uiBlueprintVersionId) ??
    approved(blueprints.data?.items)[0];
  const all = buildPrototype(
    (approved(tree.data?.items)[0]?.content as Tree | undefined)?.nodes ?? [],
    (blueprint?.content as Blueprint | undefined)?.screens ?? [],
    mockup.screens ?? [],
  );
  const [role, setRole] = useState<string | null>(null);
  const nodes = forRole(all, role);
  const screens = nodes.filter((node) => node.screen);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = screens.find((node) => node.localId === currentId) ?? screens[0];
  const index = current ? screens.indexOf(current) : -1;
  const trail: PrototypeNode[] = [];
  for (let node = current; node; node = nodes.find((n) => n.localId === node!.parentLocalId))
    trail.unshift(node);
  const related = current
    ? nodes.filter(
        (node) =>
          node.screen &&
          node !== current &&
          (node.parentLocalId === current.localId || node.parentLocalId === current.parentLocalId),
      )
    : [];
  const html = useQuery({
    queryKey: ['html-preview', current?.screen?.id],
    queryFn: async () =>
      (
        await fetchBlob(api.mockups.screenHtmlUrl(projectId, mockup.id, current!.screen!.id))
      ).text(),
    enabled: open && Boolean(current?.screen),
    retry: false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-[min(96vw,80rem)] flex-col gap-3 p-4 sm:max-w-[min(96vw,80rem)]">
        <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
          <div>
            <DialogTitle className="text-base">Prototipo navegable · {mockup.code}</DialogTitle>
            <DialogDescription className="text-xs">
              Recorra las pantallas aprobadas por el árbol de navegación, como las verá cada rol,
              antes de construir.
            </DialogDescription>
          </div>
          <label className="flex items-center gap-2 text-xs">
            Ver como
            <select
              className="h-8 rounded-md border border-input bg-background px-2"
              value={role ?? ''}
              onChange={(event) => {
                setRole(event.target.value || null);
                setCurrentId(null);
              }}
            >
              <option value="">Todos los roles</option>
              {rolesOf(all).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[16rem_1fr]">
          <nav
            aria-label="Árbol de navegación"
            className="min-h-0 overflow-auto rounded-lg border p-2 text-xs"
          >
            {tree.isLoading || blueprints.isLoading ? (
              <p className="p-2 text-muted-foreground">Cargando…</p>
            ) : !nodes.length ? (
              <p className="p-2 text-muted-foreground">No hay pantallas para este rol.</p>
            ) : (
              <ul className="flex flex-col">
                {nodes.map((node) => (
                  <li key={node.localId} style={{ paddingLeft: `${node.depth * 0.75}rem` }}>
                    {node.screen ? (
                      <button
                        type="button"
                        aria-current={node === current ? 'page' : undefined}
                        onClick={() => setCurrentId(node.localId)}
                        className={`w-full rounded px-2 py-1 text-left hover:bg-muted ${
                          node === current ? 'bg-primary/10 font-semibold text-primary' : ''
                        }`}
                      >
                        {node.label}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-1 font-medium text-muted-foreground">
                        <Folder className="size-3" aria-hidden="true" />
                        {node.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </nav>
          <section aria-label="Pantalla" className="flex min-h-0 flex-col gap-2">
            {current?.screen ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <p className="text-muted-foreground" aria-label="Ruta en la navegación">
                    {trail.map((node) => node.label).join(' › ')}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label="Pantalla anterior"
                      disabled={index <= 0}
                      onClick={() => setCurrentId(screens[index - 1]!.localId)}
                    >
                      <ChevronLeft className="size-3.5" aria-hidden="true" />
                    </Button>
                    <span className="tabular-nums text-muted-foreground">
                      {index + 1} / {screens.length}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label="Pantalla siguiente"
                      disabled={index >= screens.length - 1}
                      onClick={() => setCurrentId(screens[index + 1]!.localId)}
                    >
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                  <p className="font-semibold">{current.screen.name}</p>
                  <p className="text-muted-foreground">{current.screen.purpose}</p>
                  {current.screen.actors.length ? (
                    <p className="text-muted-foreground">
                      Para: {current.screen.actors.join(', ')}
                    </p>
                  ) : null}
                  {current.screen.actions.length ? (
                    <p className="text-muted-foreground">
                      Acciones principales: {current.screen.actions.join(', ')}
                    </p>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
                  {html.data ? (
                    <iframe
                      title={current.screen.name}
                      srcDoc={html.data}
                      sandbox=""
                      className="h-full w-full"
                    />
                  ) : (
                    <p className="p-3 text-xs text-muted-foreground">
                      {html.error ? 'No se pudo cargar la pantalla.' : 'Cargando pantalla…'}
                    </p>
                  )}
                </div>
                {related.length ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Ir a:</span>
                    {related.map((node) => (
                      <Button
                        key={node.localId}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => setCurrentId(node.localId)}
                      >
                        {node.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                El boceto aprobado no tiene pantallas que mostrar.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

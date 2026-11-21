'use client';

import { useMemo, useState } from 'react';
import type { ConstructionPreviewResponse } from '@caseflow-ai/contracts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@caseflow-ai/ui';

type PreviewFile = ConstructionPreviewResponse['files'][number];
type Node = { name: string; path: string; children: Map<string, Node>; files: PreviewFile[] };

function buildTree(files: PreviewFile[]) {
  const root: Node = { name: '', path: '', children: new Map(), files: [] };
  for (const file of files) {
    let node = root;
    const parts = file.path.split('/').filter(Boolean);
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1) node.files.push(file);
      else {
        const path = node.path ? `${node.path}/${part}` : part;
        const existing = node.children.get(part) ?? {
          name: part,
          path,
          children: new Map(),
          files: [],
        };
        node.children.set(part, existing);
        node = existing;
      }
    }
  }
  return root;
}

function countFiles(node: Node): number {
  return (
    node.files.length +
    [...node.children.values()].reduce((total, child) => total + countFiles(child), 0)
  );
}
function Folder({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth === 0 && node.name === 'apps');
  return (
    <li className="list-none">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-muted"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="font-medium text-foreground">{node.name}/</span>
        <span className="text-muted-foreground">{countFiles(node)} archivos</span>
      </button>
      {open ? (
        <ul className="ml-3 border-l border-border/60 pl-2">
          {[...node.children.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <Folder key={child.path} node={child} depth={depth + 1} />
            ))}
          {node.files
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((file) => (
              <li key={file.path} className="py-1 text-xs">
                <span className="font-mono text-foreground">{file.path.split('/').at(-1)}</span>
                <span className="ml-2 text-muted-foreground">
                  {file.purpose}
                  {file.routePath
                    ? ` · ${file.routePath}`
                    : file.endpoint
                      ? ` · ${file.endpoint}`
                      : ''}
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ProjectStructureTree({
  files,
  modules,
}: {
  files: PreviewFile[];
  modules: { localId: string; name: string }[];
}) {
  const [query, setQuery] = useState('');
  const [moduleId, setModuleId] = useState('all');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return files.filter(
      (file) =>
        (moduleId === 'all' || file.moduleLocalId === moduleId) &&
        (!normalized || `${file.path} ${file.purpose}`.toLowerCase().includes(normalized)),
    );
  }, [files, moduleId, query]);
  const tree = useMemo(() => buildTree(filtered), [filtered]);
  return (
    <Accordion
      type="single"
      collapsible
      className="rounded-xl border border-border/80 bg-card px-4"
    >
      <AccordionItem value="tree">
        <AccordionTrigger>Vista previa de carpetas y archivos ({filtered.length})</AccordionTrigger>
        <AccordionContent>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Filtrar archivos por ruta o propósito"
              placeholder="Filtrar por ruta o propósito"
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs"
            />
            <select
              value={moduleId}
              onChange={(event) => setModuleId(event.target.value)}
              aria-label="Filtrar archivos por módulo"
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="all">Todos los módulos</option>
              {modules.map((module) => (
                <option key={module.localId} value={module.localId}>
                  {module.name}
                </option>
              ))}
            </select>
          </div>
          {filtered.length ? (
            <ul>
              {[...tree.children.values()]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((node) => (
                  <Folder key={node.path} node={node} depth={0} />
                ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No hay archivos que coincidan con el filtro.
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import { api } from '../../../lib/api';

// DEC-173: what the run brings, to share with the people who will use it.
export function ReleaseNotes({ projectId, runId }: { projectId: string; runId: string }) {
  const notes = useQuery({
    queryKey: ['release-notes', projectId, runId],
    queryFn: () => api.generationRuns.releaseNotes(projectId, runId),
  });
  if (notes.isLoading) return <p className="text-xs text-muted-foreground">Preparando notas…</p>;
  if (!notes.data)
    return (
      <p className="text-xs text-destructive" role="alert">
        No se pudieron preparar las notas.
      </p>
    );
  const data = notes.data;

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.markdown);
      toast.success('Notas copiadas.');
    } catch {
      toast.error('No se pudieron copiar las notas.');
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([data.markdown], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `notas-${data.delivery ? `entrega-${data.delivery.position}` : 'construccion'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className="flex flex-col gap-3 text-xs" aria-label="Notas de entrega">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{data.title}</h4>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={copy}>
            <Copy className="size-3.5" aria-hidden="true" />
            Copiar
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={download}>
            <Download className="size-3.5" aria-hidden="true" />
            Descargar
          </Button>
        </div>
      </div>
      <section className="flex flex-col gap-1.5">
        <h5 className="font-semibold">Qué se puede hacer</h5>
        {data.canDo.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.canDo.map(({ role, useCases }) => (
              <div key={role} className="rounded-lg border p-2.5">
                <p className="font-medium">{role}</p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {useCases.map((useCase) => (
                    <li key={useCase}>{useCase}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Esta construcción aún no realiza casos de uso aprobados.
          </p>
        )}
      </section>
      <section className="flex flex-col gap-1">
        <h5 className="font-semibold">Requisitos</h5>
        <p className="text-muted-foreground">
          {data.requirements.passed.length} cumplidos · {data.requirements.failed} fallidos ·{' '}
          {data.requirements.notRun} sin probar · {data.requirements.withoutCriteria} sin criterio
          de aceptación.
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h5 className="font-semibold">Cómo probarlo</h5>
        {data.demo ? (
          <>
            {data.demo.url ? (
              <a
                href={data.demo.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                {data.demo.url}
              </a>
            ) : null}
            <ul className="text-muted-foreground">
              {data.demo.accounts.map((account) => (
                <li key={account.identifier}>
                  {account.role}: <span className="font-mono">{account.identifier}</span>
                  {account.name ? ` (${account.name})` : ''}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              La contraseña es la que se indicó al desplegar la demostración.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Despliegue esta construcción para añadir el enlace y las cuentas de prueba.
          </p>
        )}
      </section>
      <section className="flex flex-col gap-1">
        <h5 className="font-semibold">
          {data.changes.since ? `Novedades respecto de ${data.changes.since}` : 'Novedades'}
        </h5>
        {!data.changes.since ? (
          <p className="text-muted-foreground">Es la primera entrega.</p>
        ) : data.changes.newScreens.length || data.changes.newUseCases.length ? (
          <ul className="list-disc pl-4 text-muted-foreground">
            {data.changes.newScreens.map((screen) => (
              <li key={`s-${screen}`}>Pantalla nueva: {screen}</li>
            ))}
            {data.changes.newUseCases.map((useCase) => (
              <li key={`u-${useCase}`}>Ahora se puede: {useCase}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No hay pantallas ni casos de uso nuevos.</p>
        )}
      </section>
    </article>
  );
}

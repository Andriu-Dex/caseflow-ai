'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Globe, Loader2 } from 'lucide-react';
import type { DeploymentResponse } from '@caseflow-ai/contracts';
import { api } from '../../../lib/api';

const STATUS_LABELS: Record<DeploymentResponse['status'], string> = {
  STARTING: 'Preparando el despliegue (puede tardar varios minutos)…',
  RUNNING: 'En línea',
  STOPPED: 'Detenido',
  FAILED: 'No se pudo desplegar',
  REMOVED: 'Retirado',
};

// ADR-019: deploys this READY snapshot on this machine behind Cloudflare Tunnel.
export function DeploymentPanel({
  projectId,
  snapshotId,
}: {
  projectId: string;
  snapshotId: string;
}) {
  const queryClient = useQueryClient();
  const deployments = useQuery({
    queryKey: ['deployments', projectId],
    queryFn: () => api.deployments.list(projectId),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'STARTING') ? 3000 : false,
  });
  const [password, setPassword] = useState('');
  const [tunnelToken, setTunnelToken] = useState('');
  const [busy, setBusy] = useState(false);
  const current = deployments.data?.items.find((item) => item.snapshotId === snapshotId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deployments', projectId] });
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }
  const token = tunnelToken.trim() || undefined;
  return (
    <section className="mt-2.5 rounded-lg border p-2.5 text-xs" aria-label="Despliegue">
      <h3 className="flex items-center gap-1.5 font-semibold">
        <Globe className="size-3.5" aria-hidden="true" />
        Despliegue
      </h3>
      {current ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <p role="status" className="flex items-center gap-1.5">
            {current.status === 'STARTING' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {STATUS_LABELS[current.status]}
          </p>
          {current.status === 'RUNNING' && current.publicUrl ? (
            <a
              href={current.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-primary underline"
            >
              {current.publicUrl}
            </a>
          ) : null}
          {current.status === 'RUNNING' && !current.publicUrl ? (
            <p>En línea con el nombre de host configurado en su túnel de Cloudflare.</p>
          ) : null}
          {current.errorMessage ? (
            <p role="alert" className="text-destructive">
              {current.errorMessage}
            </p>
          ) : null}
          {current.accounts.length ? (
            <div>
              <p className="font-medium">
                Cuentas iniciales (contraseña: la que eligió al desplegar)
              </p>
              <ul className="list-disc pl-4">
                {current.accounts.map((account) => (
                  <li key={account.identifier}>
                    {account.role}: <span className="font-mono">{account.identifier}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {current.tunnelMode === 'QUICK' && current.status === 'RUNNING' ? (
            <p className="text-muted-foreground">
              Enlace temporal de Cloudflare para demostraciones: cambia cada vez que se inicia y
              solo está disponible mientras este equipo esté encendido.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {current.status === 'RUNNING' ? (
              <button
                type="button"
                className="rounded border px-3 py-1.5 font-semibold disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  act(() => api.deployments.stop(projectId, current.id), 'Despliegue detenido.')
                }
              >
                Detener
              </button>
            ) : null}
            {current.status === 'STOPPED' ? (
              <button
                type="button"
                className="rounded border px-3 py-1.5 font-semibold disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  act(
                    () => api.deployments.resume(projectId, current.id, { tunnelToken: token }),
                    'Despliegue iniciado.',
                  )
                }
              >
                Iniciar
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-muted-foreground">
          Publica esta versión validada en una dirección de internet, ejecutándola en Docker en este
          equipo.
        </p>
      )}
      {current?.status !== 'STARTING' ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <label htmlFor={`password-${snapshotId}`} className="font-medium">
            Contraseña inicial de las cuentas (al menos 12 caracteres)
          </label>
          <input
            id={`password-${snapshotId}`}
            type="password"
            autoComplete="new-password"
            className="rounded border bg-background p-1.5"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <details>
            <summary className="cursor-pointer">
              Usar un túnel propio de Cloudflare (dirección fija)
            </summary>
            <label htmlFor={`tunnel-${snapshotId}`} className="mt-1 block font-medium">
              Token del túnel
            </label>
            <input
              id={`tunnel-${snapshotId}`}
              type="password"
              className="mt-1 w-full rounded border bg-background p-1.5"
              value={tunnelToken}
              onChange={(event) => setTunnelToken(event.target.value)}
            />
          </details>
          <button
            type="button"
            className="self-start rounded bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy || password.length < 12}
            onClick={() =>
              act(async () => {
                await api.deployments.start(projectId, {
                  snapshotId,
                  initialPassword: password,
                  tunnelToken: token,
                });
                setPassword('');
              }, 'Despliegue en preparación.')
            }
          >
            {current ? 'Volver a desplegar' : 'Desplegar'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

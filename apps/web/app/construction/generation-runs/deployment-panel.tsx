'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Loader2,
  Play,
  Server,
  Square,
  Waypoints,
} from 'lucide-react';
import type { DeploymentHealthResponse, DeploymentResponse } from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api } from '../../../lib/api';

const STATUS: Record<DeploymentResponse['status'], { label: string; tone: string }> = {
  STARTING: {
    label: 'Preparando (puede tardar varios minutos)',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  },
  RUNNING: {
    label: 'En línea',
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  },
  STOPPED: { label: 'Detenida', tone: 'border-border bg-muted text-muted-foreground' },
  FAILED: {
    label: 'No se pudo desplegar',
    tone: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  REMOVED: { label: 'Retirada', tone: 'border-border bg-muted text-muted-foreground' },
};

type Container = DeploymentHealthResponse['containers'][number];
const CONTAINERS: Record<Container['role'], { label: string; icon: typeof Server }> = {
  APPLICATION: { label: 'Aplicación', icon: Server },
  DATABASE: { label: 'Base de datos', icon: Database },
  TUNNEL: { label: 'Túnel', icon: Waypoints },
};
const STATES: Record<Container['state'], { label: string; dot: string }> = {
  RUNNING: { label: 'En ejecución', dot: 'bg-emerald-500' },
  STOPPED: { label: 'Detenido', dot: 'bg-amber-500' },
  MISSING: { label: 'No existe', dot: 'bg-destructive' },
};

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('No se pudo copiar. Selecciónelo y cópielo a mano.');
  }
}

// ADR-019: deploys this READY snapshot on this machine behind Cloudflare Tunnel,
// and shows what a person needs to open and present the demonstration.
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
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const current = deployments.data?.items.find((item) => item.snapshotId === snapshotId);
  const live = current?.status === 'RUNNING' || current?.status === 'STOPPED';
  // Docker is asked again every half minute while the demonstration is online:
  // a restarted computer leaves it marked as running with its containers stopped.
  const health = useQuery({
    queryKey: ['deployment-health', projectId, current?.id],
    queryFn: () => api.deployments.health(projectId, current!.id),
    enabled: Boolean(current && live),
    refetchInterval: current?.status === 'RUNNING' ? 30_000 : false,
    retry: false,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['deployments', projectId] });
    await queryClient.invalidateQueries({ queryKey: ['deployment-health', projectId] });
  };
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
  const url = token ? tunnelUrl.trim() || undefined : undefined;
  const containersDown =
    current?.status === 'RUNNING' &&
    health.data?.containers.some((container) => container.state !== 'RUNNING');
  const accessText = current
    ? [
        current.publicUrl ? `Demostración: ${current.publicUrl}` : null,
        ...current.accounts.map(
          (account) =>
            `${account.role}: ${account.identifier}${account.name ? ` (${account.name})` : ''}`,
        ),
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <section
      className="mt-2.5 flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm"
      aria-label="Despliegue"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Globe className="size-4 text-primary" aria-hidden="true" />
          Demostración publicada
        </h3>
        {current ? (
          <span
            role="status"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS[current.status].tone}`}
          >
            {current.status === 'STARTING' ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : null}
            {STATUS[current.status].label}
          </span>
        ) : null}
      </div>

      {!current ? (
        <p className="text-muted-foreground">
          Publique esta versión validada en una dirección de internet, ejecutándola en Docker en
          este equipo, para presentarla o probarla con las cuentas de cada rol.
        </p>
      ) : null}

      {current?.status === 'RUNNING' ? (
        current.publicUrl ? (
          <div className="flex flex-col gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" className="gap-1.5">
                <a
                  href={current.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir la demostración en una pestaña nueva"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Abrir la demostración
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void copy(current.publicUrl!, 'Enlace')}
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Copiar enlace
              </Button>
            </div>
            <a
              href={current.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-xs text-primary underline"
            >
              {current.publicUrl}
            </a>
            <p className="text-xs text-muted-foreground">
              {current.tunnelMode === 'QUICK'
                ? 'Enlace temporal de Cloudflare: cambia cada vez que se inicia y solo funciona mientras este equipo esté encendido.'
                : 'Dirección fija de su túnel de Cloudflare.'}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            En línea con la dirección fija configurada en su túnel de Cloudflare.
          </p>
        )
      ) : null}

      {current && live && health.data ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-wrap gap-2" aria-label="Contenedores de la demostración">
            {health.data.containers.map((container) => {
              const Icon = CONTAINERS[container.role].icon;
              return (
                <li
                  key={container.role}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs"
                >
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">{CONTAINERS[container.role].label}</span>
                  <span
                    className={`size-1.5 rounded-full ${STATES[container.state].dot}`}
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">{STATES[container.state].label}</span>
                </li>
              );
            })}
          </ul>
          {containersDown ? (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Algún contenedor no está en ejecución, por ejemplo tras reiniciar el equipo. Detenga e
              inicie la demostración para levantarla de nuevo.
            </p>
          ) : null}
        </div>
      ) : null}

      {current?.errorMessage ? (
        <p role="alert" className="text-destructive">
          {current.errorMessage}
        </p>
      ) : null}

      {current?.accounts.length ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              Cuentas de la demostración{' '}
              <span className="font-normal text-muted-foreground">
                · contraseña: la que eligió al desplegar
              </span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void copy(accessText, 'Acceso')}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              Copiar accesos
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Persona</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Usuario</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Copiar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.accounts.map((account) => (
                  <tr key={account.identifier} className="border-t">
                    <td className="px-3 py-2">{account.name ?? '—'}</td>
                    <td className="px-3 py-2">{account.role}</td>
                    <td className="px-3 py-2 font-mono">{account.identifier}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        aria-label={`Copiar el usuario ${account.identifier}`}
                        onClick={() => void copy(account.identifier, 'Usuario')}
                      >
                        <Copy className="size-3.5" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {current?.status === 'RUNNING' || current?.status === 'STOPPED' ? (
        <div className="flex flex-wrap gap-2">
          {current.status === 'RUNNING' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                act(() => api.deployments.stop(projectId, current.id), 'Demostración detenida.')
              }
            >
              <Square className="size-3.5" aria-hidden="true" />
              Detener
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    api.deployments.resume(projectId, current.id, {
                      tunnelToken: token,
                      tunnelUrl: url,
                    }),
                  'Demostración iniciada.',
                )
              }
            >
              <Play className="size-3.5" aria-hidden="true" />
              Iniciar
            </Button>
          )}
        </div>
      ) : null}

      {current?.status !== 'STARTING' ? (
        <details className="group rounded-md border" open={!current}>
          <summary className="cursor-pointer px-3 py-2 font-medium">
            {current ? 'Volver a desplegar esta versión' : 'Desplegar esta versión'}
          </summary>
          <div className="flex flex-col gap-2 border-t p-3">
            <label htmlFor={`password-${snapshotId}`} className="font-medium">
              Contraseña inicial de las cuentas (al menos 12 caracteres)
            </label>
            <input
              id={`password-${snapshotId}`}
              type="password"
              autoComplete="new-password"
              className="rounded-md border bg-background p-2"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Usar un túnel propio de Cloudflare (dirección fija)
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <label htmlFor={`tunnel-${snapshotId}`} className="font-medium">
                  Token del túnel
                </label>
                <input
                  id={`tunnel-${snapshotId}`}
                  type="password"
                  className="rounded-md border bg-background p-2"
                  value={tunnelToken}
                  onChange={(event) => setTunnelToken(event.target.value)}
                />
                <label htmlFor={`tunnel-url-${snapshotId}`} className="font-medium">
                  Dirección pública del túnel (opcional)
                </label>
                <input
                  id={`tunnel-url-${snapshotId}`}
                  type="url"
                  placeholder="https://demo.su-dominio.com"
                  className="rounded-md border bg-background p-2"
                  value={tunnelUrl}
                  onChange={(event) => setTunnelUrl(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  La que configuró para este túnel en su cuenta de Cloudflare; se mostrará como
                  enlace de la demostración.
                </p>
              </div>
            </details>
            <Button
              type="button"
              className="self-start"
              disabled={busy || password.length < 12}
              onClick={() =>
                act(async () => {
                  await api.deployments.start(projectId, {
                    snapshotId,
                    initialPassword: password,
                    tunnelToken: token,
                    tunnelUrl: url,
                  });
                  setPassword('');
                }, 'Despliegue en preparación.')
              }
            >
              {current ? 'Volver a desplegar' : 'Desplegar'}
            </Button>
          </div>
        </details>
      ) : null}
    </section>
  );
}

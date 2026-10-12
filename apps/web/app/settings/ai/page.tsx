'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CirclePause,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  Laptop,
  LogOut,
  MessageSquare,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@caseflow-ai/ui';
import { DESKTOP_RELEASES_URL, desktopBridge, type CaseflowDesktop } from '../../../lib/desktop';
import { api, type AIStatus } from '../../../lib/api';

const PROVIDER_NAMES: Record<string, string> = {
  groq: 'Groq',
  gemini: 'Gemini',
  chatgpt: 'Plan de ChatGPT',
  openai_compatible: 'Proveedor compatible con OpenAI',
};

const time = (iso: string) =>
  new Date(iso).toLocaleString('es', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

// DEC-127: what each configured provider can take now. A request goes to the
// first one it fits in; work too large for all of them is split into parts.
function ProvidersCard({ status }: { status: AIStatus }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Cpu className="size-4 text-primary" aria-hidden="true" />
          Proveedores de IA
        </h2>
        {!status.available ? (
          <p className="text-sm text-muted-foreground">
            La IA no está configurada en esta instalación. Todo se puede hacer manualmente.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Cada solicitud va al primer proveedor en el que cabe. Lo que no cabe en ninguno (por
              ejemplo, el reporte de una fuente larga) se procesa por partes.
            </p>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {status.providers.map((provider) => (
                <li
                  key={provider.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
                >
                  <span className="font-medium text-foreground">
                    {PROVIDER_NAMES[provider.id] ?? provider.id}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {provider.maxInputTokens
                      ? `Hasta ${provider.maxInputTokens.toLocaleString('es')} tokens por solicitud`
                      : 'Tamaño de solicitud no declarado'}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs">
                    {provider.unavailableUntil ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {provider.quota === 'DAY'
                          ? `Cuota diaria agotada; vuelve ${time(provider.unavailableUntil)}`
                          : `En pausa hasta ${time(provider.unavailableUntil)}`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        Disponible
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const USAGE_URL = 'https://chatgpt.com/#settings';

// Web edition (DEC-117): the plan can only be used from the desktop app, so
// the same button explains why and how to install it.
function DesktopInstallAssistant() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <MessageSquare className="size-4" aria-hidden="true" />
        Continuar con ChatGPT
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use su plan de ChatGPT desde la aplicación de escritorio</DialogTitle>
            <DialogDescription>
              OpenAI solo permite usar el plan de ChatGPT en aplicaciones que se ejecutan en su
              propio equipo. La edición web, alojada en un servidor, no puede ofrecerlo.
            </DialogDescription>
          </DialogHeader>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>Descargue el instalador de CASEFlow AI para su sistema.</li>
            <li>Instálelo y ábralo: sus proyectos se guardan en su equipo.</li>
            <li>
              En «Ajustes de IA», elija «Continuar con ChatGPT» e inicie sesión con su cuenta Plus o
              Pro.
            </li>
          </ol>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            <a
              href={DESKTOP_RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Download className="size-4" aria-hidden="true" />
              Descargar la aplicación de escritorio
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChatGPTConnectionCard({ desktop }: { desktop: CaseflowDesktop }) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['chatgpt-status'],
    queryFn: () => desktop.chatgpt.status(),
  });
  const models = useQuery({
    queryKey: ['chatgpt-models'],
    queryFn: () => desktop.chatgpt.models(),
    enabled: Boolean(status.data?.connected && !status.data.paused),
  });
  const [busy, setBusy] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  async function act(action: () => Promise<unknown>, success: string | null) {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ['chatgpt-status'] });
      await queryClient.invalidateQueries({ queryKey: ['chatgpt-models'] });
    }
  }

  const data = status.data;
  if (!data) return <p className="text-sm text-muted-foreground">Cargando conexión…</p>;
  if (!data.connected)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Use la cuota de su plan Plus o Pro de ChatGPT para generar con IA, sin una clave de API.
          Se abrirá su navegador para iniciar sesión y dar su consentimiento.
        </p>
        <Button
          type="button"
          className="self-start"
          disabled={busy}
          onClick={() => act(() => desktop.chatgpt.connect(), 'Cuenta de ChatGPT conectada.')}
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          {busy ? 'Esperando el navegador…' : 'Continuar con ChatGPT'}
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>
        Conectado como <strong>{data.email ?? 'cuenta de ChatGPT'}</strong>.{' '}
        {data.active
          ? 'La IA de CASEFlow usa su plan de ChatGPT.'
          : 'La IA de CASEFlow usa el proveedor configurado en caseflow.env.'}
      </p>
      {data.paused ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <p className="flex items-center gap-2 font-medium">
            <CirclePause className="size-4" aria-hidden="true" />
            Se alcanzó el límite de uso de su plan: las solicitudes con ChatGPT están en pausa.
          </p>
          <p>
            Puede ser el límite de la aplicación, la ventana de cinco horas de Plus o el propio
            plan. Revise su uso en ChatGPT antes de reanudar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                act(() => desktop.chatgpt.resume(), 'Solicitudes con ChatGPT reanudadas.')
              }
            >
              <Play className="size-4" aria-hidden="true" />
              Reanudar con ChatGPT
            </Button>
            {data.configuredProvider && data.active ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmSwitch(true)}
              >
                Usar el otro proveedor configurado…
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="font-medium">Modelo</span>
        <select
          className="max-w-sm rounded-md border border-input bg-background px-2 py-1.5"
          value={data.model ?? ''}
          disabled={busy || !models.data?.length}
          onChange={(e) =>
            act(() => desktop.chatgpt.selectModel(e.target.value), 'Modelo actualizado.')
          }
        >
          {data.model && !models.data?.some((m) => m.slug === data.model) ? (
            <option value={data.model}>{data.model}</option>
          ) : null}
          {models.data?.map((model) => (
            <option key={model.slug} value={model.slug}>
              {model.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <a
          href={USAGE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5"
        >
          Administrar uso <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        {!data.active ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => act(() => desktop.chatgpt.prefer(true), 'La IA vuelve a usar su plan.')}
          >
            Volver a usar ChatGPT
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const { revoked } = await desktop.chatgpt.disconnect();
              if (!revoked)
                toast.warning(
                  'Se borraron las credenciales de este equipo, pero no se confirmó la desconexión remota. Desconecte CASEFlow en los ajustes de ChatGPT.',
                );
            }, 'Cuenta de ChatGPT desconectada.')
          }
        >
          <LogOut className="size-4" aria-hidden="true" />
          Desconectar
        </Button>
      </div>
      {/* Never automatic (DEC-117): another provider only with consent. */}
      <Dialog open={confirmSwitch} onOpenChange={setConfirmSwitch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Usar el otro proveedor configurado?</DialogTitle>
            <DialogDescription>
              Las generaciones dejarán de usar su plan de ChatGPT y usarán el proveedor de
              caseflow.env, que puede tener costo según su cuenta. Podrá volver a ChatGPT cuando
              quiera.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmSwitch(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await desktop.chatgpt.prefer(false);
                  setConfirmSwitch(false);
                }, 'La IA usa ahora el proveedor configurado.')
              }
            >
              Sí, usar el otro proveedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AISettingsPage() {
  // Read after mount: the bridge exists only in the desktop app's window.
  const [desktop, setDesktop] = useState<CaseflowDesktop | null | undefined>(undefined);
  useEffect(() => setDesktop(desktopBridge()), []);
  const aiStatus = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.ai.status(),
    refetchInterval: 60_000,
  });
  // DEC-128: in local development the plan runs through its own broker.
  const developmentPlan = aiStatus.data?.providers.some((p) => p.id === 'chatgpt') ?? false;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Ajustes de IA</h1>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-medium">
            <MessageSquare className="size-4 text-primary" aria-hidden="true" />
            Plan de ChatGPT
          </h2>
          {desktop === undefined ? null : desktop ? (
            <ChatGPTConnectionCard desktop={desktop} />
          ) : developmentPlan ? (
            <p className="text-sm text-muted-foreground">
              Conectado a su plan mediante el intermediario de desarrollo. La sesión se inicia en el
              navegador al ejecutar <code className="font-mono">pnpm dev</code>.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Laptop className="size-4" aria-hidden="true" />
                Disponible en la aplicación de escritorio de CASEFlow AI.
              </p>
              <div>
                <DesktopInstallAssistant />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {aiStatus.data ? <ProvidersCard status={aiStatus.data} /> : null}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Key,
  Play,
  Server,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@caseflow-ai/ui';

export const HIDE_QUICKSTART_KEY = 'caseflow:hide-quickstart-on-download';

export interface ProjectQuickstartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetTemplateIdentifier?: string;
  targetTemplateVersion?: number;
  primaryRole?: string;
  requiresAuth?: boolean;
}

interface CodeSnippetProps {
  code: string;
  onCopy: () => void;
  copied: boolean;
  comment?: string;
}

function CodeSnippet({ code, onCopy, copied, comment }: CodeSnippetProps) {
  return (
    <div className="relative rounded-lg border border-slate-200/90 bg-slate-100/75 dark:border-zinc-800 dark:bg-zinc-900/70 p-2 px-3 font-mono text-xs flex items-center justify-between gap-2 shadow-2xs group transition-colors hover:border-slate-300 dark:hover:border-zinc-700">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 overflow-x-auto select-all">
          <span className="text-slate-400 dark:text-zinc-500 select-none font-mono text-[11px] font-semibold">
            $
          </span>
          <code className="text-slate-800 dark:text-zinc-200 font-mono font-medium text-[11.5px]">
            {code}
          </code>
        </div>
        {comment ? (
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 italic select-none">
            {comment}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCopy}
        className={`h-6 px-2 text-[11px] shrink-0 font-medium transition-colors gap-1 border shadow-2xs ${
          copied
            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
            : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200/90 dark:bg-zinc-800 dark:hover:bg-zinc-750 dark:text-zinc-200 dark:border-zinc-700'
        }`}
        title="Copiar comando"
      >
        {copied ? (
          <>
            <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold text-[10.5px]">Copiado</span>
          </>
        ) : (
          <>
            <Copy className="size-3 text-slate-500 dark:text-zinc-400" />
            <span className="text-[10.5px]">Copiar</span>
          </>
        )}
      </Button>
    </div>
  );
}

// The role comes from the plan (text a person or the AI wrote) and ends up in a
// command the user pastes into a terminal: only letters, digits, spaces,
// underscores and hyphens are accepted, and the role goes in double quotes (a
// role such as "Encargado de sucursal" is one argument). Anything else shows a
// placeholder instead of being put into the command.
export function devTokenCommand(role: string): string {
  const safe = /^[\p{L}\p{N} _-]{1,60}$/u.test(role) ? role : '<rol>';
  return `pnpm --filter ./apps/api run dev-token -- "${safe}"`;
}

export function ProjectQuickstartDialog({
  open,
  onOpenChange,
  targetTemplateIdentifier = 'CASEFLOW_WEB_TS_V1',
  targetTemplateVersion = 1,
  // Unknown role: the command shows a placeholder instead of a wrong role.
  primaryRole = '<rol>',
  requiresAuth = true,
}: ProjectQuickstartDialogProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [neverShowAgain, setNeverShowAgain] = useState(false);
  const [currentPort, setCurrentPort] = useState<string>('');
  const [showPortDetails, setShowPortDetails] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentPort(
        window.location.port || (window.location.protocol === 'https:' ? '443' : '80'),
      );
      try {
        setNeverShowAgain(localStorage.getItem(HIDE_QUICKSTART_KEY) === 'true');
      } catch {
        // Local storage inaccessible
      }
    }
  }, [open]);

  const hasPortConflict = currentPort === '3000' || currentPort === '3001';

  async function copyToClipboard(text: string, key: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${label} copiado al portapapeles`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error('No se pudo copiar el comando');
    }
  }

  function handleCheckboxChange(checked: boolean) {
    setNeverShowAgain(checked);
    try {
      if (checked) {
        localStorage.setItem(HIDE_QUICKSTART_KEY, 'true');
      } else {
        localStorage.removeItem(HIDE_QUICKSTART_KEY);
      }
    } catch {
      // ignore
    }
  }

  const fullWorkflowScript = `# 1. Activar pnpm e instalar dependencias
corepack enable
pnpm install

# 2. Crear .env con secretos, iniciar PostgreSQL en Docker y crear las tablas
pnpm run setup

# 3. Arrancar frontend (Next.js) y backend (NestJS)
pnpm run dev`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col rounded-2xl border border-border/80 bg-background shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Cabecera fija */}
        <DialogHeader className="p-5 pr-12 pb-3 border-b border-border/60 bg-muted/20 dark:bg-zinc-900/40 shrink-0 gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Terminal className="size-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold tracking-tight text-foreground">
                ¿Cómo probar el proyecto en tu máquina?
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Guía rápida de ejecución local ({targetTemplateIdentifier} v{targetTemplateVersion}
                ).
              </DialogDescription>
            </div>
          </div>

          {/* Requisitos de un vistazo */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground pt-0.5">
            <span className="font-semibold text-foreground text-[11px]">Requisitos:</span>
            <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200/80 dark:border-zinc-700 px-2 py-0.5 font-mono text-[10px] font-medium">
              Node.js
            </span>
            <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200/80 dark:border-zinc-700 px-2 py-0.5 font-mono text-[10px] font-medium">
              pnpm
            </span>
            <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200/80 dark:border-zinc-700 px-2 py-0.5 font-mono text-[10px] font-medium">
              Docker Desktop
            </span>
          </div>
        </DialogHeader>

        {/* Contenido desplazable sin scrollbar visible para máxima estética */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* Tarjeta de descarga + Acción 1-click rápida */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-emerald-300/80 bg-emerald-50/70 dark:border-emerald-800/60 dark:bg-emerald-950/30 p-2.5 px-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">
                  ZIP descargado con éxito
                </span>
                <span className="text-[11px] text-emerald-800/80 dark:text-emerald-300/70">
                  Sigue estos 3 pasos en tu terminal para ejecutarlo
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(fullWorkflowScript, 'full-script', 'Flujo completo')}
              className="h-7 text-xs gap-1.5 font-semibold shrink-0 bg-white hover:bg-emerald-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-emerald-300 dark:border-emerald-700/80 text-emerald-700 dark:text-emerald-300 transition-colors shadow-2xs"
            >
              {copiedKey === 'full-script' ? (
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Copiar flujo completo (1-click)
            </Button>
          </div>

          {/* Advertencia preventiva compacta de puertos */}
          {hasPortConflict ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/80 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-950/30 p-2.5 px-3 text-xs shadow-2xs">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex flex-col gap-0.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-amber-950 dark:text-amber-200">
                    Aviso de puerto local ocupado ({currentPort})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPortDetails((prev) => !prev)}
                    className="text-[11px] text-amber-800 dark:text-amber-300 underline hover:no-underline font-medium cursor-pointer"
                  >
                    {showPortDetails ? 'Ocultar solución' : '¿Cómo resolver?'}
                  </button>
                </div>
                <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-normal">
                  CASEFlow está en ejecución en el puerto <strong>{currentPort}</strong>. El
                  proyecto generado usa por defecto el puerto 3000 (web) y 3001 (API).
                </p>
                {showPortDetails ? (
                  <div className="mt-2 pt-2 border-t border-amber-300/50 dark:border-amber-800/50 text-[11px] text-amber-950/90 dark:text-amber-200/90 leading-relaxed flex flex-col gap-1">
                    <p>
                      <strong>Opción A:</strong> Detén CASEFlow en su terminal antes de levantar el
                      proyecto generado.
                    </p>
                    <p>
                      <strong>Opción B:</strong> En el{' '}
                      <code className="font-mono bg-amber-100/80 dark:bg-amber-900/40 px-1 rounded">
                        .env
                      </code>{' '}
                      del proyecto generado cambia{' '}
                      <code className="font-mono bg-amber-100/80 dark:bg-amber-900/40 px-1 rounded">
                        API_PORT=3002
                      </code>{' '}
                      y{' '}
                      <code className="font-mono bg-amber-100/80 dark:bg-amber-900/40 px-1 rounded">
                        NEXT_PUBLIC_API_URL=http://localhost:3002
                      </code>
                      , y arranca la web con{' '}
                      <code className="font-mono bg-amber-100/80 dark:bg-amber-900/40 px-1 rounded">
                        pnpm --filter web dev -- -p 3003
                      </code>
                      .
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Stepper continuo (Línea de tiempo vertical) */}
          <div className="flex flex-col pt-0.5">
            {/* PASO 1 */}
            <div className="relative pl-7 pb-4 before:absolute before:left-2.5 before:top-6 before:bottom-0 before:w-px before:bg-slate-200 dark:before:bg-zinc-800">
              <div className="absolute left-0 top-0.5 flex size-5.5 items-center justify-center rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60 text-[11px] font-bold font-mono shadow-2xs">
                1
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">1. Preparación</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Descomprime el ZIP, abre una terminal en la carpeta y descarga las dependencias:
                </p>
                <div className="flex flex-col gap-1.5">
                  <CodeSnippet
                    code="corepack enable"
                    comment="* Solo la primera vez. Si da error de permisos: npm install -g pnpm"
                    copied={copiedKey === 'corepack'}
                    onCopy={() =>
                      copyToClipboard('corepack enable', 'corepack', 'Comando corepack')
                    }
                  />
                  <CodeSnippet
                    code="pnpm install"
                    copied={copiedKey === 'pnpm-install'}
                    onCopy={() =>
                      copyToClipboard('pnpm install', 'pnpm-install', 'Comando install')
                    }
                  />
                </div>
              </div>
            </div>

            {/* PASO 2 */}
            <div className="relative pl-7 pb-4 before:absolute before:left-2.5 before:top-6 before:bottom-0 before:w-px before:bg-slate-200 dark:before:bg-zinc-800">
              <div className="absolute left-0 top-0.5 flex size-5.5 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60 text-[11px] font-bold font-mono shadow-2xs">
                2
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">2. Base de Datos</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Un solo comando crea el .env con sus secretos, inicia PostgreSQL en Docker (en un
                  puerto libre) y crea las tablas:
                </p>
                <CodeSnippet
                  code="pnpm run setup"
                  comment="* Docker Desktop debe estar abierto. Si falla por una base anterior: pnpm run setup -- --reset"
                  copied={copiedKey === 'setup'}
                  onCopy={() => copyToClipboard('pnpm run setup', 'setup', 'Comando setup')}
                />
              </div>
            </div>

            {/* PASO 3 */}
            <div className="relative pl-7 pb-0.5">
              <div className="absolute left-0 top-0.5 flex size-5.5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60 text-[11px] font-bold font-mono shadow-2xs">
                3
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">3. ¡A rodar!</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Inicia los servidores de Next.js (web) y NestJS (API) concurrentemente:
                </p>
                <CodeSnippet
                  code="pnpm run dev"
                  copied={copiedKey === 'pnpm-dev'}
                  onCopy={() => copyToClipboard('pnpm run dev', 'pnpm-dev', 'Comando dev')}
                />

                {requiresAuth ? (
                  <div className="mt-1.5 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                      <Key className="size-3 text-muted-foreground/80 shrink-0" />
                      <span>Token de desarrollo para rol</span>
                      <code className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded text-[10.5px] border border-border/70">
                        {primaryRole}
                      </code>
                      <span className="text-[10px] text-muted-foreground/80">
                        (opcional para pruebas de API):
                      </span>
                    </div>
                    <CodeSnippet
                      code={devTokenCommand(primaryRole)}
                      copied={copiedKey === 'dev-token'}
                      onCopy={() =>
                        copyToClipboard(devTokenCommand(primaryRole), 'dev-token', 'Comando token')
                      }
                    />
                  </div>
                ) : null}

                {/* Enlaces de acceso directo */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href="http://localhost:3000"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shadow-2xs"
                  >
                    <Play className="size-3 fill-primary/20" />
                    Abrir aplicación web (http://localhost:3000)
                    <ExternalLink className="size-3 opacity-70" />
                  </a>
                  <a
                    href="http://localhost:3001/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 px-2.5 py-1 text-xs font-semibold transition-colors shadow-2xs"
                  >
                    <Server className="size-3" />
                    Swagger OpenAPI (:3001/docs)
                    <ExternalLink className="size-3 opacity-70" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pie de diálogo fijo y siempre accesible */}
        <DialogFooter className="p-3 px-5 border-t border-border/60 bg-muted/10 dark:bg-zinc-900/30 shrink-0 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={neverShowAgain}
              onChange={(e) => handleCheckboxChange(e.target.checked)}
              className="size-3.5 rounded border-input text-primary focus:ring-primary"
            />
            <span>No volver a mostrar automáticamente al descargar</span>
          </label>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 px-4 text-xs font-semibold shadow-2xs"
          >
            Cerrar guía
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

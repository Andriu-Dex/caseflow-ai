'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Container, ExternalLink, RefreshCw } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@caseflow-ai/ui';
import { api } from '../lib/api';

type Os = 'windows' | 'mac' | 'linux';

const STEPS: Record<Os, { title: string; steps: string[]; link: string }> = {
  windows: {
    title: 'Windows',
    steps: [
      'Descargue Docker Desktop para Windows desde el sitio oficial.',
      'Ejecute el instalador y deje marcada la opción «Use WSL 2».',
      'Reinicie el equipo si el instalador lo pide.',
      'Abra Docker Desktop y espere a que indique «Engine running».',
    ],
    link: 'https://docs.docker.com/desktop/setup/install/windows-install/',
  },
  mac: {
    title: 'macOS',
    steps: [
      'Descargue Docker Desktop para Mac (Apple Silicon o Intel, según su equipo).',
      'Arrastre Docker a la carpeta Aplicaciones y ábralo.',
      'Acepte los permisos que solicita y espere a que el motor esté en marcha.',
    ],
    link: 'https://docs.docker.com/desktop/setup/install/mac-install/',
  },
  linux: {
    title: 'Linux',
    steps: [
      'Instale Docker Engine con el paquete de su distribución.',
      'Agregue su usuario al grupo «docker» y cierre e inicie la sesión.',
      'Compruebe en una terminal que «docker info» responde sin errores.',
    ],
    link: 'https://docs.docker.com/engine/install/',
  },
};

function detectOs(): Os {
  if (typeof navigator === 'undefined') return 'windows';
  const platform = navigator.userAgent.toLowerCase();
  return platform.includes('mac') ? 'mac' : platform.includes('linux') ? 'linux' : 'windows';
}

// Construction validates generated code only inside Docker (§174). When it
// is missing (typically the desktop edition), planning keeps working and this
// assistant walks the user through installing it, then checks again.
export function DockerSetupAssistant() {
  const [os, setOs] = useState<Os>(detectOs);
  const status = useQuery({
    queryKey: ['sandbox-status'],
    queryFn: () => api.construction.sandboxStatus(),
  });
  if (!status.data || status.data.available) return null;
  return (
    <section
      aria-labelledby="docker-setup-title"
      className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <h2 id="docker-setup-title" className="flex items-center gap-2 font-semibold">
        <Container className="size-4" aria-hidden="true" />
        Docker es necesario para validar el código generado
      </h2>
      <p>
        La planificación funciona sin Docker, pero el código generado solo se ejecuta y valida
        dentro de un contenedor aislado. Instálelo siguiendo estos pasos:
      </p>
      <Tabs value={os} onValueChange={(value) => setOs(value as Os)}>
        <TabsList>
          {(Object.keys(STEPS) as Os[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {STEPS[key].title}
            </TabsTrigger>
          ))}
        </TabsList>
        {(Object.keys(STEPS) as Os[]).map((key) => (
          <TabsContent key={key} value={key} className="flex flex-col gap-2">
            <ol className="list-decimal pl-5">
              {STEPS[key].steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <a
              href={STEPS[key].link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium underline"
            >
              Guía oficial de instalación <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </TabsContent>
        ))}
      </Tabs>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        disabled={status.isFetching}
        onClick={() => void status.refetch()}
      >
        {status.isFetching ? (
          <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        )}
        Ya lo instalé, verificar de nuevo
      </Button>
    </section>
  );
}

'use client';

import { useState, type ReactNode } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, downloadFile } from '../lib/api';
import { useAuthedObjectUrl } from '../lib/use-authed-object-url';

export function AuthedImage({
  url,
  alt,
  className,
}: {
  url: string;
  alt: string;
  className?: string;
}) {
  const { src, isError } = useAuthedObjectUrl(url);
  if (isError)
    return (
      <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
        <ImageOff aria-hidden="true" className="size-5" />
        No se pudo cargar la imagen.
      </span>
    );
  if (!src)
    return (
      <Loader2 aria-label="Cargando imagen" className="size-5 animate-spin text-muted-foreground" />
    );
  return <img src={src} alt={alt} draggable={false} className={className} />;
}

export function AuthedDownloadButton({
  url,
  filename,
  className,
  children,
}: {
  url: string;
  filename: string;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFile(url, filename);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar el archivo.');
        } finally {
          setBusy(false);
        }
      }}
      className={className}
    >
      {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

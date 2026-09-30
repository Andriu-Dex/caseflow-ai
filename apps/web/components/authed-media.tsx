'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  disabled,
  onClick,
  ...buttonProps
}: {
  url: string;
  filename: string;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [busy, setBusy] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      {...buttonProps}
      disabled={busy || disabled}
      aria-busy={busy}
      onClick={async (event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        setBusy(true);
        timerRef.current = setTimeout(() => {
          setShowSpinner(true);
        }, 400);
        try {
          await downloadFile(url, filename);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar el archivo.');
        } finally {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          setShowSpinner(false);
          setBusy(false);
        }
      }}
      className={className}
    >
      {showSpinner ? (
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin shrink-0" />
      ) : null}
      {children}
    </button>
  );
}

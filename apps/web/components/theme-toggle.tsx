'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Return a stable placeholder during SSR to avoid hydration mismatch,
  // but keep the button dimensions to prevent layout shift.
  if (theme === null) {
    return (
      <div
        className="fixed bottom-4 right-4 z-[9999] flex size-9 sm:bottom-6 sm:right-6 sm:size-11 items-center justify-center rounded-full border border-border/50 bg-background/50 shadow-sm backdrop-blur-md"
        aria-hidden="true"
      />
    );
  }

  const isLight = theme === 'light';

  const button = (
    <Button
      variant="outline"
      size="icon"
      onPointerDown={(e) => {
        // Prevent Radix Dialog / popovers from treating this click as an outside dismiss
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        toggleTheme();
      }}
      className="fixed bottom-4 right-4 z-[9999] flex size-9 sm:bottom-6 sm:right-6 sm:size-11 items-center justify-center rounded-full border-border/80 bg-background/85 text-foreground shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-accent hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-background pointer-events-auto cursor-pointer"
      title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      aria-label="Alternar tema"
    >
      {isLight ? (
        <Moon
          className="size-4 text-muted-foreground sm:size-5 transition-colors hover:text-foreground"
          aria-hidden="true"
        />
      ) : (
        <Sun
          className="size-4 text-muted-foreground sm:size-5 transition-colors hover:text-foreground"
          aria-hidden="true"
        />
      )}
    </Button>
  );

  if (!mounted || typeof document === 'undefined') {
    return button;
  }

  return createPortal(button, document.body);
}

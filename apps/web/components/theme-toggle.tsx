'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  // Return a stable placeholder during SSR to avoid hydration mismatch,
  // but keep the button dimensions to prevent layout shift.
  if (theme === null) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex size-11 items-center justify-center rounded-full border border-border/50 bg-background/50 shadow-sm backdrop-blur-md" />
    );
  }

  const isLight = theme === 'light';

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="fixed bottom-6 right-6 z-50 flex size-11 items-center justify-center rounded-full border-border/60 bg-background/70 text-foreground shadow-sm backdrop-blur-md transition-all hover:scale-105 hover:bg-accent hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-background"
      title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      aria-label="Alternar tema"
    >
      {isLight ? (
        <Moon
          className="size-5 text-muted-foreground transition-colors hover:text-foreground"
          aria-hidden="true"
        />
      ) : (
        <Sun
          className="size-5 text-muted-foreground transition-colors hover:text-foreground"
          aria-hidden="true"
        />
      )}
    </Button>
  );
}

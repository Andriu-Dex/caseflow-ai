'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ActiveProjectProvider } from '../lib/active-project';
import { useTheme } from './theme-provider';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  const { theme } = useTheme();
  return (
    <QueryClientProvider client={client}>
      <ActiveProjectProvider>{children}</ActiveProjectProvider>
      <Toaster position="top-right" richColors closeButton theme={theme ?? 'light'} />
    </QueryClientProvider>
  );
}

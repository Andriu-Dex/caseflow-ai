'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ActiveProjectProvider } from '../lib/active-project';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <ActiveProjectProvider>{children}</ActiveProjectProvider>
    </QueryClientProvider>
  );
}

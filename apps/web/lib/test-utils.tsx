import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ActiveProjectProvider } from './active-project';

export function TestProviders({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <ActiveProjectProvider>{children}</ActiveProjectProvider>
    </QueryClientProvider>
  );
}

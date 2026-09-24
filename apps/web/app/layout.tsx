import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { Providers } from '../components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'CASEFlow AI',
  description: 'Plataforma I-CASE integrada asistida por inteligencia artificial.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

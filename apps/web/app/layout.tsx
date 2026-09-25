import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { Providers } from '../components/providers';
import { ThemeProvider } from '../components/theme-provider';
import { ThemeToggle } from '../components/theme-toggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'CASEFlow AI',
  description: 'Plataforma I-CASE integrada asistida por inteligencia artificial.',
};

// Se ejecuta antes de hidratar para evitar FOUC (Flash of Unstyled Content)
const themeScript = `
  (function() {
    try {
      var savedTheme = localStorage.getItem('caseflow-theme');
      var isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <Providers>
            <AppShell>{children}</AppShell>
            <ThemeToggle />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}

// What the desktop edition's preload exposes to this page (DEC-117). In the
// web edition there is no bridge: the ChatGPT plan is desktop-only.

export interface ChatGPTStatus {
  connected: boolean;
  email: string | null;
  model: string | null;
  paused: boolean;
  // The API currently runs on the ChatGPT plan.
  active: boolean;
  // caseflow.env names another AI provider (the alternative when paused).
  configuredProvider: boolean;
}

export interface CaseflowDesktop {
  chatgpt: {
    status(): Promise<ChatGPTStatus>;
    connect(): Promise<unknown>;
    disconnect(): Promise<{ revoked: boolean }>;
    models(): Promise<{ slug: string; displayName: string }[]>;
    selectModel(slug: string): Promise<void>;
    resume(): Promise<void>;
    prefer(chatgpt: boolean): Promise<void>;
  };
}

export function desktopBridge(): CaseflowDesktop | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { caseflowDesktop?: CaseflowDesktop }).caseflowDesktop ?? null;
}

export const DESKTOP_RELEASES_URL = 'https://github.com/Andriu-Dex/caseflow-ai/releases';

'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'caseflow.activeProjectId';

interface ActiveProjectContextValue {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
}

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null);

// Per-viewer convenience only (which project was last selected in this
// browser) — never a substitute for backend authorization, and never read
// back by the server. Every page still fetches real project-scoped data by
// this id; nothing about project isolation is enforced client-side.
export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      setProjectIdState(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // Private browsing / blocked storage: no persisted selection, not fatal.
    }
  }, []);

  const setProjectId = (id: string | null) => {
    setProjectIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures; the in-memory selection still works this session.
    }
  };

  return (
    <ActiveProjectContext.Provider value={{ projectId, setProjectId }}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

export function useActiveProject(): ActiveProjectContextValue {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) throw new Error('useActiveProject must be used within ActiveProjectProvider');
  return ctx;
}

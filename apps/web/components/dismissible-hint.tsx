'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { currentUserId } from '../lib/api';

// Help, news and first-use tips that the user can close for good (E3).
// Never for staleness, blockers, errors or validation: those stay visible
// until they are resolved, so this component deliberately has no alert role.

const storageKey = () => `caseflow.dismissedHints.${currentUserId() ?? 'anonymous'}`;

function readDismissed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey()) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function rememberDismissed(id: string) {
  try {
    const dismissed = readDismissed();
    if (!dismissed.includes(id))
      window.localStorage.setItem(storageKey(), JSON.stringify([...dismissed, id]));
  } catch {
    // Storage unavailable (private mode): the hint just shows again next time.
  }
}

export function DismissibleHint({
  id,
  label,
  children,
}: {
  // Stable key: the same hint closed on one page stays closed everywhere.
  id: string;
  // Accessible name of the button that reopens it.
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Shown once until the user closes it; afterwards only on demand.
  useEffect(() => {
    if (!readDismissed().includes(id)) setOpen(true);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const close = (returnFocus: boolean) => {
      rememberDismissed(id);
      setOpen(false);
      if (returnFocus) trigger.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, id]);

  return (
    <span ref={wrapper} className="relative inline-flex align-middle">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-describedby={open ? panelId : undefined}
        onClick={() => {
          setOpen((value) => !value);
          if (open) rememberDismissed(id);
          else requestAnimationFrame(() => closeButton.current?.focus());
        }}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={panelId}
          role="note"
          className="absolute top-full left-0 z-20 mt-1 flex w-72 max-w-[80vw] gap-2 rounded-md border border-border bg-popover p-3 text-left text-xs font-normal text-popover-foreground shadow-md"
        >
          <span className="flex-1">{children}</span>
          <button
            ref={closeButton}
            type="button"
            aria-label="Cerrar ayuda"
            onClick={() => {
              rememberDismissed(id);
              setOpen(false);
              trigger.current?.focus();
            }}
            className="self-start rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ) : null}
    </span>
  );
}

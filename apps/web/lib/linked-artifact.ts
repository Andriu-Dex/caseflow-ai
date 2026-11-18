'use client';

import { useEffect, useRef } from 'react';

// Quick search opens an artifact by sending its code: in the URL (?q=CODE)
// when it navigates to another page, or as this event when the page is
// already open, since a same-route push does not remount the list.
export const OPEN_ARTIFACT_EVENT = 'caseflow:open-artifact';

export function useLinkedArtifact(onCode: (code: string) => void) {
  const latest = useRef(onCode);
  useEffect(() => {
    latest.current = onCode;
  });
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('q');
    if (code) latest.current(code);
    const listener = (event: Event) => latest.current((event as CustomEvent<string>).detail);
    window.addEventListener(OPEN_ARTIFACT_EVENT, listener);
    return () => window.removeEventListener(OPEN_ARTIFACT_EVENT, listener);
  }, []);
}

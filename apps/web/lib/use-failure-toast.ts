import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

// Warns with a toast when a job the person is watching goes from in progress
// to failed (an interruption by a server restart included). Failures that
// were already there when the page loaded stay on their card, next to the
// retry action, without a toast on every visit.
export function useFailureToast<
  T extends { id: string; status: string; errorMessage: string | null },
>(
  items: readonly T[] | undefined,
  isActive: (status: string) => boolean,
  isFailed: (status: string) => boolean,
  fallback: string,
) {
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    for (const item of items ?? []) {
      const previous = seen.current.get(item.id);
      if (previous !== undefined && isActive(previous) && isFailed(item.status))
        toast.warning(item.errorMessage ?? fallback);
      seen.current.set(item.id, item.status);
    }
  }, [items, isActive, isFailed, fallback]);
}

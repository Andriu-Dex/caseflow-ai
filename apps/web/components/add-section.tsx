'use client';

import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';

// A creation form that is open while the list is empty (there is nothing else
// to look at) and folds behind an "+ Agregar …" button once there is at least
// one item. `children` receives `close` when the form can be dismissed.
export function AddSection({
  isEmpty,
  addLabel,
  children,
}: {
  // undefined while the list is still loading: nothing is shown yet.
  isEmpty: boolean | undefined;
  addLabel: string;
  children: (close: (() => void) | undefined) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (isEmpty === undefined) return null;
  if (isEmpty) return <>{children(undefined)}</>;
  if (open) return <>{children(() => setOpen(false))}</>;
  return (
    <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
      <Plus className="size-4" aria-hidden="true" />
      {addLabel}
    </Button>
  );
}

import { useState } from 'react';

// Small helper for manual structured editors (spec: "manual non-AI creation
// fallbacks" — Use Cases, Data Model, Navigation, Software/System
// Architecture, UI Blueprint all need repeatable-row editing without asking
// the user to author Mermaid/PlantUML/JSON by hand).
export function useRows<T>(initial: T[] = []) {
  const [rows, setRows] = useState<T[]>(initial);
  const add = (row: T) => setRows((prev) => [...prev, row]);
  const remove = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));
  const update = (index: number, patch: Partial<T>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return { rows, add, remove, update };
}

export function csv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

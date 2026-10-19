import { CornerDownRight } from 'lucide-react';

// A use case's «include» / «extend» relations as chips: on a proposal card
// and in a use case's detail.
export function UseCaseRelationChips({
  relations,
}: {
  relations: { kind: 'INCLUDE' | 'EXTEND'; label: string }[];
}) {
  if (!relations.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Relaciones">
      <CornerDownRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
      {relations.map(({ kind, label }) => (
        <span
          key={kind + label}
          className="rounded-md border border-border bg-background px-2 py-0.5 text-foreground/80"
        >
          <span className="font-mono text-[11px] text-muted-foreground">
            {kind === 'INCLUDE' ? '«include»' : '«extend»'}
          </span>{' '}
          {label}
        </span>
      ))}
    </span>
  );
}

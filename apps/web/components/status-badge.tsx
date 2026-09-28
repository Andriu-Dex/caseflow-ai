import { AlertTriangle, CheckCircle2, Clock, PenLine, Sparkles } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ArtifactVersionStatus } from '../lib/api';

// A single reusable status presentation (spec Phase I "Status system"):
// every lifecycle status is shown with an icon AND text, never color alone,
// so the meaning survives for colorblind users and in print/export.
const STATUS_META: Record<
  ArtifactVersionStatus,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  DRAFT: {
    label: 'Borrador',
    icon: PenLine,
    className: 'bg-muted text-foreground/80 border-input',
  },
  GENERATED: {
    label: 'Generado por IA',
    icon: Sparkles,
    className: 'bg-purple-50 text-purple-700 border-purple-300',
  },
  IN_REVIEW: {
    label: 'En revisión',
    icon: Clock,
    className: 'bg-amber-50 text-amber-700 border-amber-300',
  },
  APPROVED: {
    label: 'Aprobado',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  },
  CHANGES_REQUESTED: {
    label: 'Cambios solicitados',
    icon: AlertTriangle,
    className: 'bg-destructive/5 text-destructive border-destructive/40',
  },
};

export function StatusBadge({ status }: { status: ArtifactVersionStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {meta.label}
    </span>
  );
}

// Distinguishes an AI-proposed Candidate from an official Artifact Version
// (spec: "AI CANDIDATE != ARTIFACT VERSION"). Never styled like StatusBadge,
// so the two concepts are never visually confusable.
export function CandidateBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-purple-300 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
      <Sparkles aria-hidden="true" className="size-3.5" />
      Propuesta de IA
    </span>
  );
}

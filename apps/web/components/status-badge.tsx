import type { ArtifactVersionStatus } from '../lib/api';

// A single reusable status presentation (spec Phase I "Status system"):
// every lifecycle status is shown with an icon AND text, never color alone,
// so the meaning survives for colorblind users and in print/export.
const STATUS_META: Record<
  ArtifactVersionStatus,
  { label: string; icon: string; className: string }
> = {
  DRAFT: { label: 'Borrador', icon: '✎', className: 'bg-gray-100 text-gray-700 border-gray-300' },
  GENERATED: {
    label: 'Generado por IA',
    icon: '✨',
    className: 'bg-purple-50 text-purple-700 border-purple-300',
  },
  IN_REVIEW: {
    label: 'En revisión',
    icon: '⏳',
    className: 'bg-amber-50 text-amber-700 border-amber-300',
  },
  APPROVED: {
    label: 'Aprobado',
    icon: '✓',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  },
  CHANGES_REQUESTED: {
    label: 'Cambios solicitados',
    icon: '⚠',
    className: 'bg-red-50 text-red-700 border-red-300',
  },
};

export function StatusBadge({ status }: { status: ArtifactVersionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
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
      <span aria-hidden="true">✨</span>
      Candidato de IA (sin persistir)
    </span>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import {
  DESIGN_THEME_TOKENS,
  designThemeContrastIssues,
  type DesignThemeContent,
  type DesignThemeMode,
  type DesignThemePalette,
  type DesignThemeToken,
} from '@caseflow-ai/contracts';
import { ApiError } from '../lib/api';
import { ManualFormShell, save, type FormProps } from './structured-manual-forms';

// Project theme and palette (DEC-118): a mini mockup painted with the palette,
// so the user judges colors in context, plus the WCAG AA contrast check that
// gates approval.

export const TOKEN_LABELS: Record<DesignThemeToken, string> = {
  background: 'Fondo',
  foreground: 'Texto',
  primary: 'Primario',
  primaryForeground: 'Texto sobre primario',
  secondary: 'Secundario',
  secondaryForeground: 'Texto sobre secundario',
  accent: 'Acento',
  accentForeground: 'Texto sobre acento',
  muted: 'Atenuado',
  mutedForeground: 'Texto atenuado',
  destructive: 'Destructivo',
  destructiveForeground: 'Texto sobre destructivo',
  border: 'Borde',
};

const MODE_LABELS: Record<DesignThemeMode, string> = {
  LIGHT: 'Solo modo claro',
  DARK: 'Solo modo oscuro',
  BOTH: 'Claro y oscuro (con selector)',
};

// Starting point for a manual theme; both palettes pass WCAG AA.
export const DEFAULT_LIGHT_PALETTE: DesignThemePalette = {
  background: '#ffffff',
  foreground: '#0f172a',
  primary: '#4338ca',
  primaryForeground: '#ffffff',
  secondary: '#e2e8f0',
  secondaryForeground: '#1e293b',
  accent: '#ccfbf1',
  accentForeground: '#134e4a',
  muted: '#f1f5f9',
  mutedForeground: '#475569',
  destructive: '#b91c1c',
  destructiveForeground: '#ffffff',
  border: '#cbd5e1',
};
export const DEFAULT_DARK_PALETTE: DesignThemePalette = {
  background: '#0f172a',
  foreground: '#f8fafc',
  primary: '#818cf8',
  primaryForeground: '#0f172a',
  secondary: '#1e293b',
  secondaryForeground: '#f1f5f9',
  accent: '#134e4a',
  accentForeground: '#ccfbf1',
  muted: '#1e293b',
  mutedForeground: '#94a3b8',
  destructive: '#f87171',
  destructiveForeground: '#0f172a',
  border: '#334155',
};

function PalettePreview({ palette, label }: { palette: DesignThemePalette; label: string }) {
  const chip = 'rounded px-2 py-1 text-xs font-medium';
  return (
    <figure className="min-w-56 flex-1">
      <figcaption className="mb-1 text-xs font-medium text-muted-foreground">{label}</figcaption>
      <div
        className="overflow-hidden rounded-lg border text-sm"
        style={{
          background: palette.background,
          color: palette.foreground,
          borderColor: palette.border,
        }}
      >
        <div
          className="px-3 py-2 font-semibold"
          style={{ background: palette.primary, color: palette.primaryForeground }}
        >
          Mi aplicación
        </div>
        <div className="flex flex-col gap-2 p-3">
          <div>
            <p className="font-medium">Pedidos recientes</p>
            <p className="text-xs" style={{ color: palette.mutedForeground }}>
              Texto secundario de ejemplo
            </p>
          </div>
          <div
            className="rounded border px-2 py-1 text-xs"
            style={{
              background: palette.muted,
              color: palette.mutedForeground,
              borderColor: palette.border,
            }}
          >
            Buscar…
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={chip}
              style={{ background: palette.primary, color: palette.primaryForeground }}
            >
              Guardar
            </span>
            <span
              className={chip}
              style={{ background: palette.secondary, color: palette.secondaryForeground }}
            >
              Cancelar
            </span>
            <span
              className={chip}
              style={{ background: palette.accent, color: palette.accentForeground }}
            >
              Nuevo
            </span>
            <span
              className={chip}
              style={{ background: palette.destructive, color: palette.destructiveForeground }}
            >
              Eliminar
            </span>
          </div>
          <p className="text-xs" style={{ color: palette.destructive }}>
            Mensaje de error de ejemplo
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {DESIGN_THEME_TOKENS.map((token) => (
          <span
            key={token}
            title={`${TOKEN_LABELS[token]}: ${palette[token]}`}
            className="size-5 rounded border border-border"
            style={{ background: palette[token] }}
          />
        ))}
      </div>
    </figure>
  );
}

export function DesignThemePreview({ content }: { content: DesignThemeContent }) {
  const issues = designThemeContrastIssues(content);
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3 text-sm">
      <p>
        <strong>{content.name}</strong>
        <span className="text-muted-foreground"> · {MODE_LABELS[content.mode]}</span>
      </p>
      {content.description ? <p className="text-muted-foreground">{content.description}</p> : null}
      <div className="flex flex-wrap gap-4">
        {content.light ? <PalettePreview palette={content.light} label="Modo claro" /> : null}
        {content.dark ? <PalettePreview palette={content.dark} label="Modo oscuro" /> : null}
      </div>
      {issues.length ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              No cumple el contraste mínimo de accesibilidad (WCAG AA). Corríjalo antes de aprobar:
            </p>
            <ul className="mt-1 list-disc pl-4">
              {issues.map((issue) => (
                <li key={`${issue.palette}-${issue.text}-${issue.surface}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Cumple el contraste mínimo de accesibilidad (WCAG AA).
        </p>
      )}
    </div>
  );
}

function PaletteFields({
  label,
  palette,
  onChange,
}: {
  label: string;
  palette: DesignThemePalette;
  onChange: (palette: DesignThemePalette) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-foreground">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {DESIGN_THEME_TOKENS.map((token) => (
          <label key={token} className="flex items-center gap-2 text-xs">
            <input
              type="color"
              className="h-7 w-10 cursor-pointer rounded border border-input bg-background"
              value={palette[token]}
              onChange={(e) => onChange({ ...palette, [token]: e.target.value })}
            />
            <span className="text-foreground">{TOKEN_LABELS[token]}</span>
            <code className="text-muted-foreground">{palette[token]}</code>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DesignThemeManualForm({ projectId, initial, onCreated, onCancel }: FormProps) {
  const c0 = initial?.content as DesignThemeContent | undefined;
  const [title, setTitle] = useState(initial?.title ?? 'Tema del proyecto');
  const [name, setName] = useState(c0?.name ?? '');
  const [description, setDescription] = useState(c0?.description ?? '');
  const [mode, setMode] = useState<DesignThemeMode>(c0?.mode ?? 'BOTH');
  const [light, setLight] = useState(c0?.light ?? DEFAULT_LIGHT_PALETTE);
  const [dark, setDark] = useState(c0?.dark ?? DEFAULT_DARK_PALETTE);
  const [submitting, setSubmitting] = useState(false);
  const input = 'rounded-md border border-input px-2 py-1 text-sm';

  const content: DesignThemeContent = {
    name: name.trim() || 'Tema',
    description: description.trim() || undefined,
    mode,
    light: mode === 'DARK' ? undefined : light,
    dark: mode === 'LIGHT' ? undefined : dark,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await save(projectId, 'DESIGN_THEME', initial, title, content);
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el tema.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManualFormShell
      title={initial ? `Editar ${initial.code}` : 'Nuevo tema'}
      onSubmit={handleSubmit}
      submitting={submitting}
      editing={Boolean(initial)}
      onCancel={onCancel}
    >
      <input
        required
        aria-label="Título"
        placeholder="Título"
        className={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <input
          required
          aria-label="Nombre del tema"
          placeholder="Nombre del tema (p. ej. Océano)"
          className={`${input} flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          aria-label="Modo"
          className={input}
          value={mode}
          onChange={(e) => setMode(e.target.value as DesignThemeMode)}
        >
          {(Object.keys(MODE_LABELS) as DesignThemeMode[]).map((value) => (
            <option key={value} value={value}>
              {MODE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <input
        aria-label="Descripción"
        placeholder="Descripción (opcional)"
        className={input}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {mode !== 'DARK' ? (
        <PaletteFields label="Paleta clara" palette={light} onChange={setLight} />
      ) : null}
      {mode !== 'LIGHT' ? (
        <PaletteFields label="Paleta oscura" palette={dark} onChange={setDark} />
      ) : null}
      <DesignThemePreview content={content} />
    </ManualFormShell>
  );
}

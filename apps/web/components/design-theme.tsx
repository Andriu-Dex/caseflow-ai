'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Moon,
  Palette,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
  SunMoon,
  TrendingUp,
  User,
} from 'lucide-react';
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
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const copyColor = (token: DesignThemeToken, color: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(color);
      }
      setCopiedToken(token);
      toast.success(`${TOKEN_LABELS[token]} (${color}) copiado.`);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      toast.info(`Color: ${color}`);
    }
  };

  return (
    <figure className="min-w-72 flex-1 rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
      <figcaption className="mb-2.5 flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <Palette className="size-3.5 text-primary" aria-hidden="true" />
          {label}
        </span>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground border border-border/50">
          13 tokens
        </span>
      </figcaption>

      {/* Simulated Application Window */}
      <div
        className="overflow-hidden rounded-lg border text-sm shadow-sm transition-all"
        style={{
          background: palette.background,
          color: palette.foreground,
          borderColor: palette.border,
        }}
      >
        {/* Top Navbar */}
        <div
          className="flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold border-b"
          style={{
            background: palette.primary,
            color: palette.primaryForeground,
            borderColor: palette.border,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="flex size-6 items-center justify-center rounded-md font-bold text-xs"
              style={{
                background: palette.primaryForeground,
                color: palette.primary,
              }}
            >
              C
            </span>
            <span className="font-bold tracking-tight text-sm">Mi Aplicación</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className="hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: palette.accent,
                color: palette.accentForeground,
              }}
            >
              v1.0 Pro
            </span>
            <div
              className="flex size-6 items-center justify-center rounded-full text-xs font-semibold"
              style={{
                background: palette.secondary,
                color: palette.secondaryForeground,
              }}
            >
              <User className="size-3.5" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-col gap-3 p-3.5">
          {/* Header & Search */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-sm" style={{ color: palette.foreground }}>
                Panel de Control
              </p>
              <p className="text-xs" style={{ color: palette.mutedForeground }}>
                Resumen ejecutivo de actividad y ventas
              </p>
            </div>
            <div
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
              style={{
                background: palette.muted,
                color: palette.mutedForeground,
                borderColor: palette.border,
              }}
            >
              <Search className="size-3 text-muted-foreground" aria-hidden="true" />
              <span>Buscar pedido o cliente…</span>
            </div>
          </div>

          {/* Metric / KPI Card */}
          <div
            className="flex items-center justify-between rounded-lg border p-2.5"
            style={{
              background: palette.muted,
              borderColor: palette.border,
            }}
          >
            <div>
              <p className="text-[11px] font-medium" style={{ color: palette.mutedForeground }}>
                Ventas del Mes
              </p>
              <p className="text-lg font-bold tracking-tight" style={{ color: palette.foreground }}>
                $24,850.00
              </p>
            </div>
            <div
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
              style={{
                background: palette.accent,
                color: palette.accentForeground,
              }}
            >
              <TrendingUp className="size-3" aria-hidden="true" />
              <span>+18.4%</span>
            </div>
          </div>

          {/* Table / List Item simulation */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{
              borderColor: palette.border,
            }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 border-b text-xs font-medium"
              style={{
                background: palette.muted,
                color: palette.mutedForeground,
                borderColor: palette.border,
              }}
            >
              <span>PEDIDO #1042</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: palette.accent,
                  color: palette.accentForeground,
                }}
              >
                Completado
              </span>
            </div>
            <div
              className="flex items-center justify-between px-3 py-2 text-xs"
              style={{
                background: palette.background,
                color: palette.foreground,
              }}
            >
              <div>
                <p className="font-medium">Restaurante Mateos Centro</p>
                <p className="text-[11px]" style={{ color: palette.mutedForeground }}>
                  3 artículos · Mesa 4
                </p>
              </div>
              <span className="font-bold">$142.50</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            className="flex flex-wrap items-center gap-2 pt-1 border-t"
            style={{ borderColor: palette.border }}
          >
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-semibold shadow-2xs transition-opacity hover:opacity-90"
              style={{
                background: palette.primary,
                color: palette.primaryForeground,
              }}
            >
              Guardar cambios
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-medium border transition-opacity hover:opacity-90"
              style={{
                background: palette.secondary,
                color: palette.secondaryForeground,
                borderColor: palette.border,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 ml-auto"
              style={{
                background: palette.destructive,
                color: palette.destructiveForeground,
              }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>

      {/* Token Palette Swatches Grid */}
      <div className="mt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
          Tokens de color ({DESIGN_THEME_TOKENS.length})
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
          {DESIGN_THEME_TOKENS.map((token) => {
            const color = palette[token];
            const isCopied = copiedToken === token;
            return (
              <button
                key={token}
                type="button"
                onClick={() => copyColor(token, color)}
                title={`Copiar ${TOKEN_LABELS[token]}: ${color}`}
                className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/80 p-1.5 text-left transition-colors hover:border-border hover:bg-muted/30 cursor-pointer"
              >
                <span
                  className="size-4 shrink-0 rounded-full border border-border/80 shadow-2xs"
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground text-[10px] leading-tight">
                    {TOKEN_LABELS[token]}
                  </p>
                  <p className="font-mono text-muted-foreground text-[9px]">{color}</p>
                </div>
                {isCopied ? (
                  <Check className="size-3 text-emerald-600 shrink-0" aria-hidden="true" />
                ) : (
                  <Copy className="size-2.5 text-muted-foreground/60 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </figure>
  );
}

export function DesignThemePreview({ content }: { content: DesignThemeContent }) {
  const issues = designThemeContrastIssues(content);
  const [activeTab, setActiveTab] = useState<'ALL' | 'LIGHT' | 'DARK'>('ALL');

  const showBoth = content.mode === 'BOTH';
  const showLight =
    (showBoth && (activeTab === 'ALL' || activeTab === 'LIGHT')) || content.mode === 'LIGHT';
  const showDark =
    (showBoth && (activeTab === 'ALL' || activeTab === 'DARK')) || content.mode === 'DARK';

  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border/70 pt-3 text-sm">
      {/* Title & Mode */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold text-foreground">{content.name}</h4>
            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-medium">
              {MODE_LABELS[content.mode]}
            </span>
          </div>
          {content.description ? (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {content.description}
            </p>
          ) : null}
        </div>

        {/* View Switcher for BOTH mode */}
        {showBoth ? (
          <div className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('LIGHT')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === 'LIGHT'
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sun className="size-3 text-amber-500" aria-hidden="true" />
              Modo claro
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('DARK')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === 'DARK'
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Moon className="size-3 text-indigo-400" aria-hidden="true" />
              Modo oscuro
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <SunMoon className="size-3 text-primary" aria-hidden="true" />
              Lado a lado
            </button>
          </div>
        ) : null}
      </div>

      {/* Simulated Palettes */}
      <div className="flex flex-col lg:flex-row gap-4">
        {showLight && content.light ? (
          <PalettePreview palette={content.light} label="Paleta modo claro" />
        ) : null}
        {showDark && content.dark ? (
          <PalettePreview palette={content.dark} label="Paleta modo oscuro" />
        ) : null}
      </div>

      {/* Accessibility / WCAG AA Card */}
      {issues.length ? (
        <div
          role="alert"
          className="flex gap-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900 shadow-2xs dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <ShieldAlert
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold text-amber-950 dark:text-amber-100">
              No cumple el contraste mínimo de accesibilidad (WCAG AA). Corríjalo antes de aprobar:
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              {issues.map((issue) => (
                <li key={`${issue.palette}-${issue.text}-${issue.surface}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5 text-xs shadow-2xs">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium">
            <ShieldCheck
              className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0"
              aria-hidden="true"
            />
            <span>
              Certificación de Accesibilidad: Cumple el contraste mínimo de accesibilidad (WCAG AA).
            </span>
          </div>
          <span className="hidden sm:inline-flex rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold border border-emerald-500/20">
            Ratio ≥ 4.5:1
          </span>
        </div>
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

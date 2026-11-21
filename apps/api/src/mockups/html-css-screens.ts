import { z } from 'zod';
import { defaultTreeAdapter, parse, serialize } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { AIError, type AIOrchestrator } from '@caseflow-ai/ai';
import type {
  DesignThemeContent,
  DesignThemePalette,
  MockupDeviceType,
  ProjectLanguage,
} from '@caseflow-ai/contracts';
import {
  MockupProviderError,
  type BlueprintScreen,
  type GeneratedScreen,
  type HtmlScreenRenderer,
  type MockupAppContext,
  type ScreenGenerator,
} from '@caseflow-ai/integrations';
import { checkedMockupPage } from './manual-mockup-archive';
import { MOCKUP_HTML_SCREEN_PROMPT } from './html-css-prompt';

// DEC-167: mockups drawn by the AI as HTML and CSS instead of Stitch. CASEFlow
// owns the page around each screen (the stylesheet from the approved theme, the
// application name and its menu), so every screen of a mockup looks alike and
// the AI only writes what is particular to the screen.
export const HTML_CSS_PROVIDER_REF = 'html-css';
export const HTML_CSS_GENERATOR_VERSION = 'caseflow-html-css-v2';

export const mockupScreenBodySchema = z.object({ body: z.string().min(20).max(60_000) }).strict();

// The classes the AI may use, with what each one is for (ADR-028).
const DESIGN_CLASSES: Record<string, string> = {
  'page-header': 'encabezado de la pantalla: un div con el título y, a la derecha, sus acciones',
  hint: 'texto breve bajo el título',
  band: 'banda oscura de inicio o de detalle: el saludo o el estado y, en un grid, las cifras clave',
  'band-stat': 'cifra clave dentro de band, con stat-label y stat-value',
  card: 'sección con borde; dentro, card-header (título h2 y acciones) y card-body',
  'grid grid-2 / grid-3 / grid-4': 'columnas para tarjetas o indicadores',
  stat: 'indicador con stat-label y stat-value',
  table: 'tabla de datos; num alinea a la derecha las columnas numéricas',
  chip: 'valor corto destacado en una celda (una hora, un código de sala)',
  filters:
    'fila de filtros rápidos por estado, cada uno un button con su recuento («En venta · 14»); filter-active el elegido',
  facts: 'lista dl de clave y valor (dt y dd) para los datos de un registro',
  timeline:
    'lista ol del historial: cada li con el suceso y, debajo, muted con la hora y la persona',
  prose: 'texto largo legible, a lo ancho',
  'form-grid': 'formulario en dos columnas; full ocupa toda la fila',
  field: 'etiqueta (label) con su control: input, select o textarea con la misma clase',
  actions: 'fila de botones alineada a la derecha',
  'btn btn-primary / btn-secondary / btn-danger / btn-link':
    'botones; btn-primary solo para la acción principal de la pantalla, una sola',
  'badge badge-success / badge-warning / badge-danger / badge-muted':
    'estado breve: normal, requiere atención, error o inactivo',
  alert: 'aviso; alert-warning o alert-danger según la gravedad',
  'tabs y tab / tab-active': 'pestañas para separar información general y detalle',
  'details y summary': 'detalle técnico plegado, cerrado por defecto',
  toolbar: 'búsqueda y filtros sobre una lista',
  pagination: 'anterior y siguiente bajo una lista',
  empty: 'mensaje cuando no hay registros',
  muted: 'texto secundario',
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;',
  );

const STANDARD_PALETTE: DesignThemePalette = {
  background: '#f8fafc',
  foreground: '#0f172a',
  primary: '#1e3a8a',
  primaryForeground: '#ffffff',
  secondary: '#e0e7ff',
  secondaryForeground: '#1e3a8a',
  accent: '#f97316',
  accentForeground: '#0f172a',
  muted: '#f1f5f9',
  mutedForeground: '#475569',
  destructive: '#b91c1c',
  destructiveForeground: '#ffffff',
  border: '#e5e7eb',
};

// The stylesheet every screen of the mockup shares, painted with the approved
// palette (the light one when the application supports both modes) and laid
// out as the visual standard (ADR-028): a dark sidebar and dark bands in tones
// of the primary colour, one accent for the main action, states with a fixed
// meaning.
export function mockupStylesheet(theme?: DesignThemeContent): string {
  const p = theme?.light ?? theme?.dark ?? STANDARD_PALETTE;
  return `
:root { --background: ${p.background}; --foreground: ${p.foreground}; --primary: ${p.primary}; --primary-foreground: ${p.primaryForeground}; --secondary: ${p.secondary}; --secondary-foreground: ${p.secondaryForeground}; --accent: ${p.accent}; --accent-foreground: ${p.accentForeground}; --muted: ${p.muted}; --muted-foreground: ${p.mutedForeground}; --destructive: ${p.destructive}; --destructive-foreground: ${p.destructiveForeground}; --border: ${p.border};
  --sidebar: color-mix(in oklab, var(--primary) 22%, #0b1020); --sidebar-active: color-mix(in oklab, var(--primary) 32%, #1e293b);
  --band: color-mix(in oklab, var(--primary) 45%, #0b1020); --band-tile: color-mix(in oklab, var(--primary) 62%, #0b1020); --band-muted: color-mix(in oklab, #ffffff 78%, var(--primary));
  --soft-primary: color-mix(in oklab, var(--primary) 12%, #ffffff); --soft-accent: color-mix(in oklab, var(--accent) 16%, #ffffff); --line: color-mix(in oklab, var(--border) 60%, #ffffff); }
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: var(--foreground); background: color-mix(in oklab, var(--muted) 60%, var(--background)); }
.app { display: flex; min-height: 100vh; }
.app-side { width: 236px; flex-shrink: 0; background: var(--sidebar); color: #e2e8f0; padding: 18px 12px; display: flex; flex-direction: column; gap: 2px; }
.app-name { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #ffffff; padding: 4px 10px 18px; }
.app-mark { width: 30px; height: 30px; border-radius: 8px; background: var(--accent); color: var(--accent-foreground); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; }
.app-nav { display: flex; flex-direction: column; gap: 2px; }
.app-nav span { padding: 9px 10px; border-radius: 8px; }
.app-nav .active { background: var(--sidebar-active); color: #ffffff; font-weight: 600; }
.app-body { flex: 1; min-width: 0; }
main { max-width: 1180px; margin: 0 auto; padding: 28px 32px 48px; display: flex; flex-direction: column; gap: 20px; }
main.auth { max-width: 440px; margin-top: 56px; }
h1 { font-size: 26px; line-height: 1.25; margin: 0; font-weight: 700; }
h2 { font-size: 16px; margin: 0; font-weight: 700; }
p { margin: 0; }
.page-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.hint, .muted { color: var(--muted-foreground); }
.hint { margin-top: 4px; }
.band { background: var(--band); color: #ffffff; border-radius: 14px; padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; }
.band h1, .band h2 { color: #ffffff; }
.band .hint, .band .muted, .band .stat-label { color: var(--band-muted); }
.band-stat { background: var(--band-tile); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.band-stat .stat-value { color: #ffffff; }
.card { border: 1px solid var(--border); border-radius: 14px; background: var(--background); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.card-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.grid { display: grid; gap: 14px; }
.grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.stat { border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; background: var(--background); }
.stat-label { font-size: 12px; color: var(--muted-foreground); }
.stat-value { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; }
table, .table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 12px; font-weight: 600; color: var(--muted-foreground); padding: 12px 16px; border-bottom: 1px solid var(--border); background: color-mix(in oklab, var(--muted) 50%, var(--background)); }
td { padding: 12px 16px; border-bottom: 1px solid var(--line); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.chip { display: inline-flex; padding: 5px 10px; border-radius: 8px; background: var(--muted); color: var(--foreground); font-weight: 700; font-variant-numeric: tabular-nums; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filters button { border-radius: 999px; min-height: 38px; }
.filters .filter-active { background: var(--band); border-color: var(--band); color: #ffffff; }
.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 24px; margin: 0; }
.facts dt { font-size: 12px; color: var(--muted-foreground); }
.facts dd { margin: 2px 0 0; font-weight: 600; }
.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.timeline li { position: relative; padding-left: 22px; font-weight: 600; }
.timeline li::before { content: ''; position: absolute; left: 0; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--border); }
.timeline li:first-child::before { background: var(--accent); }
.timeline .muted { display: block; font-weight: 400; font-size: 12px; }
.prose { max-width: 72ch; font-size: 15px; line-height: 1.6; }
.form-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.full { grid-column: 1 / -1; }
.field { display: flex; flex-direction: column; gap: 6px; }
label { font-weight: 500; }
input, select, textarea, .input, .select, .textarea { width: 100%; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: var(--foreground); font: inherit; }
input[type="checkbox"], input[type="radio"] { width: auto; min-height: 0; }
textarea, .textarea { min-height: 80px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.btn, button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--border); background: var(--background); color: var(--foreground); font: inherit; font-weight: 600; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-foreground); font-weight: 700; }
.btn-secondary { background: var(--background); border-color: var(--border); color: var(--foreground); }
.btn-danger { background: var(--background); border-color: color-mix(in oklab, var(--destructive) 45%, #ffffff); color: var(--destructive); }
.btn-link { border: 0; background: none; color: var(--primary); padding: 0; min-height: 0; }
a { color: var(--primary); text-decoration: none; font-weight: 600; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--muted); color: var(--muted-foreground); }
.badge-success { background: var(--soft-primary); color: var(--primary); }
.badge-warning { background: var(--soft-accent); color: color-mix(in oklab, var(--accent) 70%, #000000); }
.badge-danger { background: color-mix(in oklab, var(--destructive) 12%, #ffffff); color: var(--destructive); }
.badge-muted { background: var(--muted); color: var(--muted-foreground); }
.alert { padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border); background: var(--background); }
.alert-warning { background: var(--soft-accent); border-color: color-mix(in oklab, var(--accent) 35%, #ffffff); }
.alert-danger { background: color-mix(in oklab, var(--destructive) 10%, #ffffff); border-color: color-mix(in oklab, var(--destructive) 30%, #ffffff); color: var(--destructive); }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
.tab { padding: 8px 14px; color: var(--muted-foreground); }
.tab-active { color: var(--foreground); border-bottom: 2px solid var(--accent); font-weight: 600; }
details { border: 1px solid var(--border); border-radius: 12px; background: var(--background); }
summary { padding: 12px 20px; font-weight: 500; color: var(--muted-foreground); }
details > :not(summary) { margin: 0 20px 16px; }
ul.list { list-style: none; margin: 0; padding: 0; }
ul.list li { padding: 10px 0; border-bottom: 1px solid var(--line); }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.pagination { display: flex; align-items: center; justify-content: space-between; }
.empty { padding: 32px; text-align: center; color: var(--muted-foreground); }
@media (max-width: 760px) {
  .app { flex-direction: column; }
  .app-side { width: auto; }
  .app-nav { flex-direction: row; flex-wrap: wrap; }
  main { padding: 20px 16px 32px; }
  .grid-2, .grid-3, .grid-4, .form-grid, .facts { grid-template-columns: 1fr; }
}
`.trim();
}

// The full page of one screen: CASEFlow's own document around the AI's body.
export function mockupDocument(input: {
  appName: string;
  menu: string[];
  active: string | null;
  title: string;
  body: string;
  theme?: DesignThemeContent;
}): string {
  const withMenu = input.active !== null && input.menu.length > 0;
  const nav = input.menu
    .map((entry) =>
      entry === input.active
        ? `<span class="active">${escapeHtml(entry)}</span>`
        : `<span>${escapeHtml(entry)}</span>`,
    )
    .join('');
  const mark = (input.appName.match(/\p{L}+/gu) ?? [])
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  const page = `<main${withMenu ? '' : ' class="auth"'}>${input.body}</main>`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(input.title)}</title><style>
${mockupStylesheet(input.theme)}
</style></head>
<body>${
    withMenu
      ? `<div class="app"><aside class="app-side"><span class="app-name"><span class="app-mark">${escapeHtml(mark)}</span>${escapeHtml(input.appName)}</span><nav class="app-nav">${nav}</nav></aside><div class="app-body">${page}</div></div>`
      : page
  }</body></html>
`;
}

type Element = DefaultTreeAdapterMap['element'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

// What the AI wrote for a screen: the content of its main element.
export function mockupBody(html: string): string | undefined {
  const find = (node: ParentNode): Element | undefined => {
    for (const child of node.childNodes) {
      if (!defaultTreeAdapter.isElementNode(child)) continue;
      if (child.tagName === 'main') return child;
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  };
  const main = find(parse(html));
  return main ? serialize(main) : undefined;
}

// The screen-by-screen generator for HTML and CSS mockups. The model never
// writes the page directly: its body is placed in CASEFlow's page, checked like
// a hand-made page and drawn in the isolated browser.
export class HtmlCssScreenGenerator implements ScreenGenerator {
  constructor(
    private readonly ai: AIOrchestrator,
    private readonly renderer: HtmlScreenRenderer,
    private readonly projectId: string,
    private readonly language: ProjectLanguage,
  ) {}

  async createProject(): Promise<string> {
    return HTML_CSS_PROVIDER_REF;
  }

  generateScreen(
    _providerProjectId: string,
    screen: BlueprintScreen,
    deviceType: MockupDeviceType,
    refinement?: string,
    theme?: DesignThemeContent,
    context?: MockupAppContext,
  ): Promise<GeneratedScreen> {
    return this.draw(screen, deviceType, refinement, theme, context);
  }

  async draw(
    screen: BlueprintScreen,
    deviceType: MockupDeviceType,
    refinement?: string,
    theme?: DesignThemeContent,
    context?: MockupAppContext,
    previousBody?: string,
  ): Promise<GeneratedScreen> {
    let body: string;
    try {
      body = (
        await this.ai.generateStructured({
          projectId: this.projectId,
          language: this.language,
          promptKey: MOCKUP_HTML_SCREEN_PROMPT.key,
          promptVersion: MOCKUP_HTML_SCREEN_PROMPT.version,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                appName: context?.appName ?? 'Aplicación',
                deviceType,
                screen,
                approvedRequirements: (context?.approvedRequirements ?? []).map(
                  ({ description }) => description,
                ),
                designSystem: DESIGN_CLASSES,
                ...(refinement ? { refinement } : {}),
                ...(previousBody ? { previousBody } : {}),
              }),
            },
          ],
          outputSchema: mockupScreenBodySchema,
          schemaName: 'mockup_screen',
          maxOutputTokens: 12_000,
        })
      ).data.body;
    } catch (error) {
      if (error instanceof AIError)
        throw new MockupProviderError(
          'MOCKUP_PROVIDER_UNAVAILABLE',
          'La IA no pudo diseñar la pantalla.',
          { cause: error },
        );
      throw error;
    }
    const checked = checkedMockupPage(
      mockupDocument({
        appName: context?.appName ?? 'Aplicación',
        menu: context?.menu ?? [],
        active: context?.activeMenuByScreen[screen.localId] ?? null,
        title: screen.name,
        body,
        theme,
      }),
    );
    if ('problem' in checked)
      throw new MockupProviderError(
        'MOCKUP_PROVIDER_ERROR',
        `La pantalla propuesta ${checked.problem}.`,
      );
    const image = await this.renderer.render(checked.page, deviceType);
    return {
      screenLocalId: screen.localId,
      screenName: screen.name,
      image: { body: image, contentType: 'image/png' },
      html: checked.page,
      providerRef: { projectId: HTML_CSS_PROVIDER_REF, screenId: screen.localId },
    };
  }
}

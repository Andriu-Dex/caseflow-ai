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
export const HTML_CSS_GENERATOR_VERSION = 'caseflow-html-css-v1';

export const mockupScreenBodySchema = z.object({ body: z.string().min(20).max(60_000) }).strict();

// The classes the AI may use, with what each one is for.
const DESIGN_CLASSES: Record<string, string> = {
  'page-header': 'encabezado de la pantalla: un div con el título y, a la derecha, sus acciones',
  hint: 'texto breve bajo el título',
  card: 'sección con borde; dentro, card-header (título h2 y acciones) y card-body',
  'grid grid-2 / grid-3 / grid-4': 'columnas para tarjetas o indicadores',
  stat: 'indicador con stat-label y stat-value',
  table: 'tabla de datos; num alinea a la derecha las columnas numéricas',
  'form-grid': 'formulario en dos columnas; full ocupa toda la fila',
  field: 'etiqueta (label) con su control: input, select o textarea con la misma clase',
  actions: 'fila de botones alineada a la derecha',
  'btn btn-primary / btn-secondary / btn-danger / btn-link': 'botones según su importancia',
  'badge badge-success / badge-warning / badge-danger': 'estado breve',
  alert: 'aviso; alert-warning o alert-danger según la gravedad',
  'tabs y tab / tab-active': 'pestañas para separar información general y detalle',
  'details y summary': 'detalle técnico plegado, cerrado por defecto',
  toolbar: 'filtros y búsqueda sobre una lista',
  pagination: 'anterior y siguiente bajo una lista',
  empty: 'mensaje cuando no hay registros',
  muted: 'texto secundario',
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;',
  );

const STANDARD_PALETTE: DesignThemePalette = {
  background: '#ffffff',
  foreground: '#0f172a',
  primary: '#4f46e5',
  primaryForeground: '#ffffff',
  secondary: '#e2e8f0',
  secondaryForeground: '#1e293b',
  accent: '#eef2ff',
  accentForeground: '#3730a3',
  muted: '#f1f5f9',
  mutedForeground: '#64748b',
  destructive: '#dc2626',
  destructiveForeground: '#ffffff',
  border: '#e2e8f0',
};

// The stylesheet every screen of the mockup shares, painted with the approved
// palette: the light one when the application supports both modes.
export function mockupStylesheet(theme?: DesignThemeContent): string {
  const p = theme?.light ?? theme?.dark ?? STANDARD_PALETTE;
  return `
:root { --background: ${p.background}; --foreground: ${p.foreground}; --primary: ${p.primary}; --primary-foreground: ${p.primaryForeground}; --secondary: ${p.secondary}; --secondary-foreground: ${p.secondaryForeground}; --accent: ${p.accent}; --accent-foreground: ${p.accentForeground}; --muted: ${p.muted}; --muted-foreground: ${p.mutedForeground}; --destructive: ${p.destructive}; --destructive-foreground: ${p.destructiveForeground}; --border: ${p.border}; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: var(--foreground); background: var(--background); }
.app-header { display: flex; align-items: center; gap: 28px; padding: 14px 32px; border-bottom: 1px solid var(--border); }
.app-name { font-size: 18px; font-weight: 700; color: var(--primary); white-space: nowrap; }
.app-nav { display: flex; flex-wrap: wrap; gap: 6px 18px; }
.app-nav span { padding: 4px 0; font-weight: 500; }
.app-nav .active { color: var(--primary); border-bottom: 2px solid var(--primary); }
main { max-width: 1152px; margin: 0 auto; padding: 28px 32px 48px; display: flex; flex-direction: column; gap: 20px; }
main.auth { max-width: 440px; margin-top: 56px; }
h1 { font-size: 24px; line-height: 1.25; margin: 0; }
h2 { font-size: 15px; margin: 0; }
p { margin: 0; }
.page-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
.hint, .muted { color: var(--muted-foreground); }
.hint { margin-top: 4px; }
.card { border: 1px solid var(--border); border-radius: 10px; background: var(--background); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--border); }
.card-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.grid { display: grid; gap: 12px; }
.grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.stat { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.stat-label { font-size: 12px; color: var(--muted-foreground); }
.stat-value { font-size: 22px; font-weight: 700; }
table, .table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted-foreground); padding: 8px 12px; border-bottom: 1px solid var(--border); }
td { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.num { text-align: right; }
.form-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.full { grid-column: 1 / -1; }
.field { display: flex; flex-direction: column; gap: 6px; }
label { font-weight: 500; }
input, select, textarea, .input, .select, .textarea { width: 100%; min-height: 38px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: var(--foreground); font: inherit; }
input[type="checkbox"], input[type="radio"] { width: auto; min-height: 0; }
textarea, .textarea { min-height: 80px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.btn, button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--background); color: var(--foreground); font: inherit; font-weight: 600; }
.btn-primary { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
.btn-secondary { background: var(--secondary); border-color: var(--secondary); color: var(--secondary-foreground); }
.btn-danger { background: var(--destructive); border-color: var(--destructive); color: var(--destructive-foreground); }
.btn-link { border: 0; background: none; color: var(--primary); padding: 0; min-height: 0; }
a { color: var(--primary); text-decoration: none; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid var(--border); background: var(--muted); color: var(--muted-foreground); }
.badge-success { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.badge-warning { background: #fffbeb; border-color: #fde68a; color: #b45309; }
.badge-danger { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
.alert { padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--muted); }
.alert-warning { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.alert-danger { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
.tab { padding: 8px 14px; color: var(--muted-foreground); }
.tab-active { color: var(--primary); border-bottom: 2px solid var(--primary); font-weight: 600; }
details { border: 1px solid var(--border); border-radius: 10px; }
summary { padding: 12px 20px; font-weight: 500; color: var(--muted-foreground); }
details > :not(summary) { margin: 0 20px 16px; }
ul.list { list-style: none; margin: 0; padding: 0; }
ul.list li { padding: 10px 0; border-bottom: 1px solid var(--border); }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.pagination { display: flex; align-items: center; justify-content: space-between; }
.empty { padding: 32px; text-align: center; color: var(--muted-foreground); }
@media (max-width: 640px) {
  .app-header { flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 16px; }
  main { padding: 20px 16px 32px; }
  .grid-2, .grid-3, .grid-4, .form-grid { grid-template-columns: 1fr; }
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
  const header = withMenu
    ? `<header class="app-header"><span class="app-name">${escapeHtml(input.appName)}</span><nav class="app-nav">${nav}</nav></header>`
    : '';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(input.title)}</title><style>
${mockupStylesheet(input.theme)}
</style></head>
<body>${header}<main${withMenu ? '' : ' class="auth"'}>${input.body}</main></body></html>
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

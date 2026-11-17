import { describe, expect, it, vi } from 'vitest';
import { AIError, type AIOrchestrator } from '@caseflow-ai/ai';
import type { DesignThemeContent } from '@caseflow-ai/contracts';
import {
  FakeHtmlScreenRenderer,
  MockupProviderError,
  type BlueprintScreen,
  type MockupAppContext,
} from '@caseflow-ai/integrations';
import { HtmlCssScreenGenerator, mockupBody, mockupDocument } from './html-css-screens';

const screen: BlueprintScreen = {
  localId: 'ventas',
  name: 'Historial de ventas',
  purpose: 'Consultar las ventas del día.',
  targetActors: ['Cajero'],
  relatedUseCaseCodes: [],
  sections: ['Ventas'],
  primaryActions: ['Nueva venta'],
  secondaryActions: [],
  principalData: ['Total'],
  forms: [],
  states: [],
};
const context: MockupAppContext = {
  appName: 'Mateos',
  menu: ['Panel', 'Ventas'],
  activeMenuByScreen: { ventas: 'Ventas', acceso: null },
  approvedRequirements: [{ code: 'RF-001', versionId: 'v', description: 'Registrar ventas.' }],
};
const theme = {
  name: 'Mateos',
  mode: 'LIGHT',
  light: {
    background: '#ffffff',
    foreground: '#111111',
    primary: '#3730a3',
    primaryForeground: '#ffffff',
    secondary: '#e0e7ff',
    secondaryForeground: '#1e1b4b',
    accent: '#eef2ff',
    accentForeground: '#312e81',
    muted: '#f4f4f5',
    mutedForeground: '#52525b',
    destructive: '#b91c1c',
    destructiveForeground: '#ffffff',
    border: '#e4e4e7',
  },
} as DesignThemeContent;

function generator(body: string | Error) {
  const generateStructured = vi.fn(async () => {
    if (body instanceof Error) throw body;
    return { data: { body } };
  });
  const renderer = new FakeHtmlScreenRenderer();
  const instance = new HtmlCssScreenGenerator(
    { generateStructured } as unknown as AIOrchestrator,
    renderer,
    'project',
    'ES',
  );
  return { instance, renderer, generateStructured };
}

describe('mockupDocument', () => {
  it('places the screen in the page with the application name and its active menu entry', () => {
    const page = mockupDocument({
      appName: 'Mateos & Cía',
      menu: ['Panel', 'Ventas'],
      active: 'Ventas',
      title: 'Ventas',
      body: '<h1>Ventas</h1>',
      theme,
    });
    expect(page).toContain('<span class="app-name">Mateos &amp; Cía</span>');
    expect(page).toContain('<span class="active">Ventas</span>');
    expect(page).toContain('--primary: #3730a3;');
    expect(page).toContain('<main><h1>Ventas</h1></main>');
  });

  it('draws a screen outside the menu, such as the sign-in, without the header', () => {
    const page = mockupDocument({
      appName: 'Mateos',
      menu: ['Panel'],
      active: null,
      title: 'Acceso',
      body: '<h1>Acceso</h1>',
    });
    expect(page).not.toContain('<header');
    expect(page).toContain('<main class="auth"><h1>Acceso</h1></main>');
  });
});

describe('HtmlCssScreenGenerator', () => {
  it('asks the AI for the screen body, checks the page and draws it', async () => {
    const { instance, renderer, generateStructured } = generator(
      '<div class="page-header"><h1>Historial de ventas</h1></div><table><tr><td>$12,50</td></tr></table>',
    );
    const drawn = await instance.generateScreen(
      'html-css',
      screen,
      'DESKTOP',
      undefined,
      theme,
      context,
    );
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKey: 'mockup.html-screen',
        promptVersion: 1,
        projectId: 'project',
      }),
    );
    const request = JSON.parse(
      (generateStructured.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0]
        .messages[0]!.content,
    );
    expect(request).toMatchObject({ appName: 'Mateos', screen: { localId: 'ventas' } });
    expect(request.approvedRequirements).toEqual(['Registrar ventas.']);
    expect(drawn).toMatchObject({
      screenLocalId: 'ventas',
      screenName: 'Historial de ventas',
      image: { contentType: 'image/png' },
      providerRef: { projectId: 'html-css', screenId: 'ventas' },
    });
    expect(drawn.html).toMatch(/<head><meta http-equiv="Content-Security-Policy"/);
    expect(drawn.html).toContain('<span class="active">Ventas</span>');
    expect(renderer.rendered).toEqual([{ html: drawn.html, deviceType: 'DESKTOP' }]);
  });

  it('sends the instruction and the previous body when a screen is edited', async () => {
    const { instance, generateStructured } = generator(
      '<h1>Historial de ventas</h1><p>Filtrado</p>',
    );
    await instance.draw(
      screen,
      'MOBILE',
      'Agrega un filtro por fecha',
      theme,
      context,
      '<h1>Antes</h1>',
    );
    const request = JSON.parse(
      (generateStructured.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0]
        .messages[0]!.content,
    );
    expect(request).toMatchObject({
      deviceType: 'MOBILE',
      refinement: 'Agrega un filtro por fecha',
      previousBody: '<h1>Antes</h1>',
    });
  });

  it('refuses a body that would run code, without drawing it', async () => {
    const { instance, renderer } = generator('<h1>Ventas</h1><img src="x.png" onerror="robar()">');
    await expect(instance.draw(screen, 'DESKTOP', undefined, theme, context)).rejects.toThrow(
      new MockupProviderError(
        'MOCKUP_PROVIDER_ERROR',
        'La pantalla propuesta contiene manejadores de eventos.',
      ),
    );
    expect(renderer.rendered).toHaveLength(0);
  });

  it('reports an unavailable AI as an unavailable provider', async () => {
    const { instance } = generator(new AIError('AI_PROVIDER_UNAVAILABLE', 'sin cuota'));
    await expect(instance.draw(screen, 'DESKTOP')).rejects.toThrow(
      'La IA no pudo diseñar la pantalla.',
    );
  });
});

describe('mockupBody', () => {
  it('returns what the AI wrote inside the main element of a stored page', () => {
    const page = mockupDocument({
      appName: 'A',
      menu: [],
      active: null,
      title: 'T',
      body: '<h1>Uno</h1><p>Dos</p>',
    });
    expect(mockupBody(page)).toBe('<h1>Uno</h1><p>Dos</p>');
  });
});

import { describe, expect, it } from 'vitest';
import { MockupRenderer } from './mockup-renderer';
import { sanitizeDiagramSvg } from '../data-models/svg-sanitizer';

describe('MockupRenderer', () => {
  const renderer = new MockupRenderer();

  it('renders a deterministic wireframe with header, sections and actions', () => {
    const content = {
      screens: [
        {
          localId: 'home',
          name: 'Inicio',
          purpose: 'Ver el panel principal',
          targetActors: [],
          relatedUseCaseCodes: [],
          sections: ['Resumen', 'Actividad reciente'],
          primaryActions: ['Crear'],
          secondaryActions: ['Exportar'],
          principalData: [],
          forms: ['Formulario de búsqueda'],
          states: [],
        },
      ],
    };
    const first = renderer.render(content);
    expect(renderer.render(content)).toBe(first);
    expect(first).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(first).toContain('Inicio');
    expect(first).toContain('Ver el panel principal');
    expect(first).toContain('Resumen');
    expect(first).toContain('Crear');
    expect(first).toContain('Exportar');
    expect(first).toContain('Formulario de búsqueda');
    expect(first).toContain('fill="#4f46e5"');
    expect(first).not.toContain('#2563eb');
    expect(first).toContain('width="392"');
    expect(() => sanitizeDiagramSvg(first)).not.toThrow();
  });

  it('escapes unsafe screen/section/action text instead of injecting raw markup', () => {
    const content = {
      screens: [
        {
          localId: 'a',
          name: '<script>alert(1)</script>',
          purpose: 'p',
          targetActors: [],
          relatedUseCaseCodes: [],
          sections: ['<img src=x onerror=alert(2)>'],
          primaryActions: [],
          secondaryActions: [],
          principalData: [],
          forms: [],
          states: [],
        },
      ],
    };
    const svg = renderer.render(content);
    expect(svg).not.toMatch(/<script[\s>]/i);
    expect(svg).not.toMatch(/<img[\s/>]/i);
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('orders screens ordinally and renders every screen as its own card', () => {
    const content = {
      screens: [
        {
          localId: 'b',
          name: 'Segundo',
          purpose: 'p',
          targetActors: [],
          relatedUseCaseCodes: [],
          sections: [],
          primaryActions: [],
          secondaryActions: [],
          principalData: [],
          forms: [],
          states: [],
        },
        {
          localId: 'a',
          name: 'Primero',
          purpose: 'p',
          targetActors: [],
          relatedUseCaseCodes: [],
          sections: [],
          primaryActions: [],
          secondaryActions: [],
          principalData: [],
          forms: [],
          states: [],
        },
      ],
    };
    const svg = renderer.render(content);
    expect(svg.indexOf('Primero')).toBeLessThan(svg.indexOf('Segundo'));
    expect(svg).toContain('width="768"');
    expect(svg).toContain('x="392"');
    expect(() => sanitizeDiagramSvg(svg)).not.toThrow();
  });

  it('uses three columns for four screens and wraps the fourth below the first', () => {
    const screen = {
      name: 'Pantalla',
      purpose: 'Propósito extenso '.repeat(6),
      targetActors: ['Administrador', 'Operador'],
      relatedUseCaseCodes: [],
      sections: [],
      primaryActions: [],
      secondaryActions: [],
      principalData: [],
      forms: [],
      states: [],
    };
    const svg = renderer.render({
      screens: ['a', 'b', 'c', 'd'].map((localId) => ({ ...screen, localId })),
    });
    expect(svg).toContain('width="1144"');
    expect(svg).toContain('x="16" y="16" width="360"');
    expect(svg).toContain('x="392" y="16" width="360"');
    expect(svg).toContain('x="768" y="16" width="360"');
    expect(svg).toContain('x="16" y="144" width="360"');
    expect(svg).toContain('Actores: Administrador, Operador');
    expect(svg).toContain('…');
    expect(svg).not.toContain('Propósito extenso '.repeat(6));
    expect(() => sanitizeDiagramSvg(svg)).not.toThrow();
  });
});

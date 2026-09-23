import { describe, expect, it } from 'vitest';
import { MockupRenderer } from './mockup-renderer';

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
    expect(first).toContain('Resumen');
    expect(first).toContain('Crear');
    expect(first).toContain('Exportar');
    expect(first).toContain('Formulario de búsqueda');
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
  });
});

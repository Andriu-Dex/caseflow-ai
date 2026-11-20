import { describe, expect, it } from 'vitest';
import { FRONTEND_DESIGN_PROMPT_V41 } from './frontend-design-prompt';

describe('screen composition prompt', () => {
  it('keeps the visual rules and limits observations to the screen (DEC-164)', () => {
    for (const rule of [
      'VISUAL FIDELITY.',
      'SCOPE OF LIMITATIONS.',
      'VISUAL STANDARD.',
      'PERSON REQUESTS.',
    ])
      expect(FRONTEND_DESIGN_PROMPT_V41).toContain(rule);
    // Earlier versions asked to audit server code against the blueprint.
    expect(FRONTEND_DESIGN_PROMPT_V41).not.toContain('Inspect actual server behavior');
  });

  it('is generic: no entity, route or wording of a particular project', () => {
    expect(FRONTEND_DESIGN_PROMPT_V41).not.toMatch(
      /menu|branch|dish|catering|sucursal|plato|BORRADOR|PUBLICADA|\/checkout/i,
    );
  });
});

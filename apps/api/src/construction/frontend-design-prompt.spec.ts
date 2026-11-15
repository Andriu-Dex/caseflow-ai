import { describe, expect, it } from 'vitest';
import { FRONTEND_DESIGN_PROMPT_V37, FRONTEND_DESIGN_PROMPT_V38 } from './frontend-design-prompt';

describe('screen composition prompt', () => {
  it('keeps the visual rules of v37 and limits observations to the screen (DEC-164)', () => {
    expect(FRONTEND_DESIGN_PROMPT_V38).toContain('VISUAL FIDELITY.');
    expect(FRONTEND_DESIGN_PROMPT_V38).toContain('SCOPE OF LIMITATIONS.');
    // v36 asked to audit server code against the blueprint; v38 does not.
    expect(FRONTEND_DESIGN_PROMPT_V37).toContain('Inspect actual server behavior');
    expect(FRONTEND_DESIGN_PROMPT_V38).not.toContain('Inspect actual server behavior');
    expect(FRONTEND_DESIGN_PROMPT_V38.length).toBeLessThan(
      FRONTEND_DESIGN_PROMPT_V37.length + 1000,
    );
  });
});

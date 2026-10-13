import { describe, expect, it } from 'vitest';
import { PROJECT_CONTEXT_PROMPT_V5 } from './context-prompt';

describe('project-context.generate@5 (DEC-133)', () => {
  it('says nothing about the proposal that the model could copy into the context', () => {
    // v4 ended with "Esto es un borrador candidato para revisión humana, no un
    // Contexto oficial", which came back as the first lines of a context.
    expect(PROJECT_CONTEXT_PROMPT_V5).not.toMatch(/borrador|candidato|Contexto oficial/i);
  });

  it('keeps the project apart from the product', () => {
    expect(PROJECT_CONTEXT_PROMPT_V5).toContain('interactúan directamente con el software');
    expect(PROJECT_CONTEXT_PROMPT_V5).toContain('No son actores los interesados');
    expect(PROJECT_CONTEXT_PROMPT_V5).toContain(
      'Lo que pertenece al proyecto y no al software no es necesidad, regla ni restricción',
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  PROJECT_CONTEXT_COLLECTION_LIMIT,
  projectContextRequestSchema,
} from './project-context.contract';

const valid = () => ({
  problemStatement: 'Procesos manuales dispersos.',
  objective: 'Centralizar la gestión.',
  scopeItems: [
    { type: 'IN_SCOPE' as const, description: 'Gestionar proyectos.' },
    { type: 'OUT_OF_SCOPE' as const, description: 'Facturación.' },
  ],
  actors: [{ name: 'Analista', description: 'Define el contexto.' }],
  needs: [{ description: 'Mantener trazabilidad.' }],
  constraints: [{ description: 'Debe funcionar sin IA.' }],
  businessRules: [{ description: 'Cada proyecto tiene un contexto.' }],
  additionalContext: 'Información complementaria.',
});

describe('projectContextRequestSchema', () => {
  it('trims all accepted strings', () => {
    const input = valid();
    input.problemStatement = '  Problema  ';
    input.actors[0]!.name = '  Analista  ';
    const parsed = projectContextRequestSchema.parse(input);
    expect(parsed.problemStatement).toBe('Problema');
    expect(parsed.actors[0]?.name).toBe('Analista');
  });

  it.each([
    ['problem statement', { problemStatement: '   ' }],
    ['objective', { objective: '' }],
    ['actor name', { actors: [{ name: ' ', description: 'x' }] }],
    ['collection description', { needs: [{ description: ' ' }] }],
  ])('rejects blank %s', (_label, change) => {
    expect(projectContextRequestSchema.safeParse({ ...valid(), ...change }).success).toBe(false);
  });

  it('rejects invalid scope types and unknown properties', () => {
    expect(
      projectContextRequestSchema.safeParse({
        ...valid(),
        scopeItems: [{ type: 'MAYBE', description: 'x' }],
      }).success,
    ).toBe(false);
    expect(projectContextRequestSchema.safeParse({ ...valid(), hidden: true }).success).toBe(false);
  });

  it('rejects abusive collection sizes', () => {
    const needs = Array.from({ length: PROJECT_CONTEXT_COLLECTION_LIMIT + 1 }, () => ({
      description: 'Necesidad válida',
    }));
    expect(projectContextRequestSchema.safeParse({ ...valid(), needs }).success).toBe(false);
  });
});

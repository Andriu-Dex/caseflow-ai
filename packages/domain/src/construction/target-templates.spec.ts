import { describe, expect, it } from 'vitest';
import {
  CASEFLOW_WEB_TS_V1,
  TARGET_TEMPLATES,
  VALIDATION_STAGES,
  findCatalogDependency,
  findTargetTemplate,
} from './target-templates';

describe('target templates', () => {
  it('ships exactly one V1 template with the approved stack and design profile', () => {
    expect(TARGET_TEMPLATES.map((t) => `${t.identifier}@${t.version}`)).toEqual([
      'CASEFLOW_WEB_TS_V1@1',
    ]);
    expect(CASEFLOW_WEB_TS_V1.designSystemProfile.identifier).toBe('CASEFLOW_STANDARD_WEB_V1');
    for (const name of ['next', 'react', '@nestjs/core', 'prisma', 'zod', 'react-hook-form'])
      expect(findCatalogDependency(CASEFLOW_WEB_TS_V1, name)).toBeDefined();
  });

  it('never approves a stack outside the template', () => {
    for (const name of ['django', '@angular/core', 'typeorm', 'express-generator'])
      expect(findCatalogDependency(CASEFLOW_WEB_TS_V1, name)).toBeUndefined();
  });

  it('resolves the latest or an exact version, and nothing for unknown templates', () => {
    expect(findTargetTemplate('CASEFLOW_WEB_TS_V1')).toBe(CASEFLOW_WEB_TS_V1);
    expect(findTargetTemplate('CASEFLOW_WEB_TS_V1', 1)).toBe(CASEFLOW_WEB_TS_V1);
    expect(findTargetTemplate('CASEFLOW_WEB_TS_V1', 99)).toBeUndefined();
    expect(findTargetTemplate('CASEFLOW_DJANGO_REACT')).toBeUndefined();
  });

  it('pins every dependency to an exact version and lists each package once', () => {
    const names = CASEFLOW_WEB_TS_V1.dependencies.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    for (const d of CASEFLOW_WEB_TS_V1.dependencies) expect(d.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares one shell-free command per validation stage, in pipeline order', () => {
    expect(CASEFLOW_WEB_TS_V1.validationCommands.map((c) => c.stage)).toEqual([
      ...VALIDATION_STAGES,
    ]);
    for (const { argv } of CASEFLOW_WEB_TS_V1.validationCommands) {
      expect(argv[0]).toBe('pnpm');
      for (const arg of argv) expect(arg).not.toMatch(/[;&|`$<>\s]/);
    }
  });

  it('is immutable at runtime', () => {
    expect(Object.isFrozen(CASEFLOW_WEB_TS_V1)).toBe(true);
    expect(Object.isFrozen(CASEFLOW_WEB_TS_V1.dependencies)).toBe(true);
    expect(Object.isFrozen(CASEFLOW_WEB_TS_V1.dependencies[0])).toBe(true);
    expect(Object.isFrozen(CASEFLOW_WEB_TS_V1.validationCommands[0]!.argv)).toBe(true);
  });
});

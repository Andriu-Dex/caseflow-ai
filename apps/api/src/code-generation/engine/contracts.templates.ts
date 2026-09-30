import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { lowerFirst, upperFirst } from '../naming';
import {
  SCOPE,
  dependencies,
  file,
  json,
  type GeneratedProjectFile,
  type GenerationContext,
} from './types';

type Entity = ImplementationPlanContent['entities'][number];
type Field = Entity['fields'][number];

export const enumConstName = (entity: string, field: string) =>
  `${entity}${upperFirst(field)}Values`;
export const createSchemaName = (entity: string) => `create${entity}Schema`;
export const updateSchemaName = (entity: string) => `update${entity}Schema`;

// Relations whose foreign key a client sends (many-to-many links are not
// part of the CRUD inputs in this template version).
export const inputRelations = (entity: Entity) =>
  entity.relations.filter((relation) => relation.kind !== 'MANY_TO_MANY');

function zodFor(entity: Entity, field: Field): string {
  const required = field.required;
  switch (field.type) {
    case 'STRING':
      return required
        ? "z.string().trim().min(1, 'Este campo es obligatorio.').max(255)"
        : 'z.string().trim().max(255).nullish()';
    case 'TEXT':
      return required
        ? "z.string().trim().min(1, 'Este campo es obligatorio.').max(10000)"
        : 'z.string().trim().max(10000).nullish()';
    case 'INT':
      return `z.number().int()${required ? '' : '.nullish()'}`;
    case 'DECIMAL':
      return `z.string().regex(/^-?\\d{1,10}(\\.\\d{1,2})?$/, 'Ingrese un número con hasta 2 decimales.')${required ? '' : '.nullish()'}`;
    case 'BOOLEAN':
      return `z.boolean()${required ? '' : '.nullish()'}`;
    case 'DATE':
      return `z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/, 'Ingrese una fecha válida.')${required ? '' : '.nullish()'}`;
    case 'DATETIME':
      return `z.iso.datetime()${required ? '' : '.nullish()'}`;
    case 'ENUM':
      return `z.enum(${enumConstName(entity.name, field.name)})${required ? '' : '.nullish()'}`;
  }
}

// A value that satisfies the field's schema, used by generated tests.
export function sampleValue(entity: Entity, field: Field): unknown {
  switch (field.type) {
    case 'STRING':
      return `${upperFirst(field.name)} de ejemplo`;
    case 'TEXT':
      return 'Texto de ejemplo';
    case 'INT':
      return 1;
    case 'DECIMAL':
      return '10.50';
    case 'BOOLEAN':
      return true;
    case 'DATE':
      return '2026-01-15';
    case 'DATETIME':
      return '2026-01-15T10:00:00.000Z';
    case 'ENUM':
      return field.enumValues[0];
  }
  return entity.name;
}

export const SAMPLE_ID = '11111111-1111-4111-8111-111111111111';

export function sampleInput(entity: Entity): Record<string, unknown> {
  return Object.fromEntries([
    ...entity.fields.map((field): [string, unknown] => [field.name, sampleValue(entity, field)]),
    ...inputRelations(entity).map((relation): [string, unknown] => [
      `${relation.name}Id`,
      SAMPLE_ID,
    ]),
  ]);
}

export function contractsFiles(ctx: GenerationContext): GeneratedProjectFile[] {
  const { plan, template } = ctx;
  const blocks = plan.entities.map((entity) => {
    const enums = entity.fields
      .filter((f) => f.type === 'ENUM')
      .map(
        (f) =>
          `export const ${enumConstName(entity.name, f.name)} = [${f.enumValues.map((v) => `'${v}'`).join(', ')}] as const;`,
      );
    const props = [
      ...entity.fields.map((f) => `  ${f.name}: ${zodFor(entity, f)},`),
      ...inputRelations(entity).map(
        (r) => `  ${r.name}Id: ${r.required ? 'z.uuid()' : 'z.uuid().nullish()'},`,
      ),
    ];
    return [
      `// ---- ${entity.name}${entity.description ? `: ${entity.description.replace(/\s+/g, ' ')}` : ''}`,
      ...enums,
      `export const ${createSchemaName(entity.name)} = z`,
      '  .object({',
      ...props.map((p) => `  ${p}`),
      '  })',
      '  .strict();',
      `export type Create${entity.name}Input = z.infer<typeof ${createSchemaName(entity.name)}>;`,
      `export const ${updateSchemaName(entity.name)} = ${createSchemaName(entity.name)}.partial();`,
      `export type Update${entity.name}Input = z.infer<typeof ${updateSchemaName(entity.name)}>;`,
    ].join('\n');
  });

  const tests = plan.entities.map((entity) => {
    const sample = sampleInput(entity);
    const required = entity.fields.find((f) => f.required);
    return `  describe('${entity.name}', () => {
    const valid = ${JSON.stringify(sample)};
    it('accepts a valid ${lowerFirst(entity.name)}', () => {
      expect(${createSchemaName(entity.name)}.safeParse(valid).success).toBe(true);
    });
    it('rejects unknown fields', () => {
      expect(${createSchemaName(entity.name)}.safeParse({ ...valid, unexpected: true }).success).toBe(false);
    });${
      required
        ? `
    it('requires ${required.name}', () => {
      const { ${required.name}: _omitted, ...rest } = valid;
      void _omitted;
      expect(${createSchemaName(entity.name)}.safeParse(rest).success).toBe(false);
    });`
        : ''
    }
    it('allows partial updates', () => {
      expect(${updateSchemaName(entity.name)}.safeParse({}).success).toBe(true);
    });
  });`;
  });

  const planElements = plan.entities.map((e) => `entity:${e.localId}`);
  return [
    file(
      'packages/contracts/package.json',
      json({
        name: `${SCOPE}/contracts`,
        version: '0.1.0',
        private: true,
        main: './dist/index.js',
        types: './dist/index.d.ts',
        scripts: {
          build: 'tsc -p tsconfig.build.json',
          typecheck: 'tsc --noEmit',
          lint: 'eslint src',
          test: 'vitest run',
        },
        dependencies: dependencies(template, ['zod']),
        devDependencies: dependencies(template, ['typescript', 'vitest', '@types/node']),
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'packages/contracts/tsconfig.json',
      json({
        extends: '../../tsconfig.base.json',
        compilerOptions: { rootDir: 'src', outDir: 'dist', declaration: true },
        include: ['src'],
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'packages/contracts/tsconfig.build.json',
      json({ extends: './tsconfig.json', exclude: ['src/**/*.spec.ts'] }),
      { kind: 'CONFIG' },
    ),
    file(
      'packages/contracts/src/index.ts',
      [
        '// Input contracts shared by the API (request validation) and the web app',
        '// (form validation). Generated from the approved Implementation Plan.',
        "import { z } from 'zod';",
        '',
        blocks.join('\n\n'),
      ].join('\n'),
      { origin: 'DETERMINISTIC', planElements },
    ),
    file(
      'packages/contracts/src/index.spec.ts',
      [
        "import { describe, expect, it } from 'vitest';",
        `import { ${plan.entities.flatMap((e) => [createSchemaName(e.name), updateSchemaName(e.name)]).join(', ')} } from './index';`,
        '',
        "describe('input contracts', () => {",
        tests.join('\n\n'),
        '});',
      ].join('\n'),
      { origin: 'DETERMINISTIC', kind: 'TEST', planElements },
    ),
  ];
}

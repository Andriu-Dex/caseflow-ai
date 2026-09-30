import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import {
  PlanGenerationError,
  lowerFirst,
  pluralize,
  snakeCase,
  tableName,
  upperFirst,
} from './naming';

type Entity = ImplementationPlanContent['entities'][number];
type Field = Entity['fields'][number];

// Deterministic Implementation Plan -> Prisma schema for the generated project
// (AGENTS.md §18: persistence boilerplate is templated, never AI-written).
// Conventions: every model gets a UUID id and created/updated timestamps; FK
// relations restrict deletes; database names are snake_case.

const SCALAR: Record<Exclude<Field['type'], 'ENUM'>, { type: string; native?: string }> = {
  STRING: { type: 'String' },
  TEXT: { type: 'String', native: '@db.Text' },
  INT: { type: 'Int' },
  DECIMAL: { type: 'Decimal', native: '@db.Decimal(12, 2)' },
  BOOLEAN: { type: 'Boolean' },
  DATE: { type: 'DateTime', native: '@db.Date' },
  DATETIME: { type: 'DateTime', native: '@db.Timestamptz(6)' },
};

export const enumTypeName = (entity: string, field: string) => `${entity}${upperFirst(field)}`;

const mapped = (name: string) => (snakeCase(name) === name ? '' : ` @map("${snakeCase(name)}")`);

interface Line {
  name: string;
  type: string;
  attributes: string;
}

export function generatePrismaSchema(plan: ImplementationPlanContent): string {
  const byLocalId = new Map(plan.entities.map((entity) => [entity.localId, entity]));
  const lines = new Map<string, Line[]>(plan.entities.map((entity) => [entity.name, []]));
  const enums: string[] = [];
  const add = (entity: string, line: Line) => {
    const existing = lines.get(entity)!;
    if (existing.some((l) => l.name === line.name))
      throw new PlanGenerationError(
        `La entidad ${entity} tendría dos campos llamados «${line.name}»; renombre la relación o el campo.`,
      );
    existing.push(line);
  };

  for (const entity of plan.entities) {
    add(entity.name, { name: 'id', type: 'String', attributes: '@id @default(uuid()) @db.Uuid' });
    for (const field of entity.fields) {
      const optional = field.required ? '' : '?';
      const unique = field.unique ? ' @unique' : '';
      if (field.type === 'ENUM') {
        const name = enumTypeName(entity.name, field.name);
        enums.push(
          `enum ${name} {\n${field.enumValues.map((v) => `  ${v}`).join('\n')}\n\n  @@map("${snakeCase(name)}")\n}`,
        );
        add(entity.name, {
          name: field.name,
          type: `${name}${optional}`,
          attributes: `${unique}${mapped(field.name)}`.trim(),
        });
      } else {
        const scalar = SCALAR[field.type];
        add(entity.name, {
          name: field.name,
          type: `${scalar.type}${optional}`,
          attributes: [unique.trim(), mapped(field.name).trim(), scalar.native]
            .filter(Boolean)
            .join(' '),
        });
      }
    }
  }

  // Relations: the owning side holds the FK; the target gets a deterministic
  // inverse field (e.g. Order.customer -> Customer.orders).
  for (const entity of plan.entities)
    for (const relation of entity.relations) {
      const target = byLocalId.get(relation.targetEntityLocalId)!;
      const relationName = `${entity.name}_${relation.name}`;
      const sameTargetCount = entity.relations.filter(
        (r) => r.targetEntityLocalId === relation.targetEntityLocalId,
      ).length;
      const inverseBase = lowerFirst(pluralize(entity.name));
      const inverse =
        sameTargetCount > 1 ? `${inverseBase}As${upperFirst(relation.name)}` : inverseBase;
      if (relation.kind === 'MANY_TO_MANY') {
        add(entity.name, {
          name: relation.name,
          type: `${target.name}[]`,
          attributes: `@relation("${relationName}")`,
        });
        add(target.name, {
          name: inverse,
          type: `${entity.name}[]`,
          attributes: `@relation("${relationName}")`,
        });
        continue;
      }
      const fk = `${relation.name}Id`;
      const optional = relation.required ? '' : '?';
      const unique = relation.kind === 'ONE_TO_ONE' ? ' @unique' : '';
      add(entity.name, {
        name: fk,
        type: `String${optional}`,
        attributes: `${unique.trim()}${mapped(fk)} @db.Uuid`.trim(),
      });
      add(entity.name, {
        name: relation.name,
        type: `${target.name}${optional}`,
        attributes: `@relation("${relationName}", fields: [${fk}], references: [id], onDelete: Restrict)`,
      });
      add(target.name, {
        name: relation.kind === 'ONE_TO_ONE' ? lowerFirst(entity.name) : inverse,
        type: relation.kind === 'ONE_TO_ONE' ? `${entity.name}?` : `${entity.name}[]`,
        attributes: `@relation("${relationName}")`,
      });
    }

  for (const entity of plan.entities) {
    add(entity.name, {
      name: 'createdAt',
      type: 'DateTime',
      attributes: '@default(now()) @map("created_at") @db.Timestamptz(6)',
    });
    add(entity.name, {
      name: 'updatedAt',
      type: 'DateTime',
      attributes: '@updatedAt @map("updated_at") @db.Timestamptz(6)',
    });
  }

  const models = plan.entities.map((entity) => {
    const fields = lines.get(entity.name)!;
    const nameWidth = Math.max(...fields.map((f) => f.name.length));
    const typeWidth = Math.max(...fields.map((f) => f.type.length));
    const body = fields
      .map((f) =>
        `  ${f.name.padEnd(nameWidth)} ${f.type.padEnd(typeWidth)} ${f.attributes}`.trimEnd(),
      )
      .join('\n');
    const doc = entity.description ? `/// ${entity.description.replace(/\s+/g, ' ')}\n` : '';
    return `${doc}model ${entity.name} {\n${body}\n\n  @@map("${tableName(entity.name)}")\n}`;
  });

  return [
    '// Generated from the approved Implementation Plan. Change the plan and',
    '// regenerate rather than editing this file by hand.',
    '',
    'generator client {',
    '  provider     = "prisma-client"',
    '  output       = "../apps/api/src/generated/prisma"',
    '  moduleFormat = "cjs"',
    '}',
    '',
    'datasource db {',
    '  provider = "postgresql"',
    '}',
    '',
    ...[...enums, ...models].flatMap((block) => [block, '']),
  ].join('\n');
}

import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { lowerFirst } from '../naming';
import { file, type GeneratedProjectFile, type GenerationContext } from './types';

type Plan = ImplementationPlanContent;

// What the demo-data script needs of each entity, computed from the plan.
interface DemoEntity {
  model: string;
  delegate: string;
  fields: {
    name: string;
    label: string;
    type: string;
    required: boolean;
    unique: boolean;
    enumValues: string[];
    value?: string | number | boolean;
  }[];
  relations: { name: string; target: string; required: boolean; unique: boolean }[];
  samples?: Record<string, string | number | boolean>[];
}

// DEC-159: demonstration data, deterministic and derived from the plan, so a
// deployed project does not start empty. Accounts and the operation scope
// come from deploy-accounts; the rest of the creatable entities get a few
// records each, in dependency order.
export function demoEntities(plan: Plan): DemoEntity[] {
  const local = plan.authentication.local;
  const excluded = new Set(
    [local?.userEntityLocalId, local?.sessionEntityLocalId, local?.scope?.entityLocalId].filter(
      Boolean,
    ),
  );
  const byId = new Map(plan.entities.map((entity) => [entity.localId, entity]));
  const candidates = plan.entities.filter(
    (entity) => entity.operations.includes('CREATE') && !excluded.has(entity.localId),
  );
  const describe = (entity: Plan['entities'][number]): DemoEntity => ({
    model: entity.name,
    delegate: lowerFirst(entity.name),
    fields: entity.fields.map((field) => ({
      name: field.name,
      label: field.label ?? field.name,
      type: field.type,
      required: field.required,
      unique: field.unique,
      enumValues: field.enumValues,
      ...(entity.lifecycle?.stateField === field.name
        ? { value: entity.lifecycle.initialState }
        : field.serverDefault !== undefined
          ? { value: field.serverDefault }
          : {}),
    })),
    relations: (entity.relations ?? [])
      .filter((relation) => relation.kind !== 'MANY_TO_MANY')
      .map((relation) => ({
        name: relation.name,
        target: byId.get(relation.targetEntityLocalId)!.name,
        required: relation.required,
        unique: relation.kind === 'ONE_TO_ONE',
      })),
  });
  // Dependency order: an entity comes after the entities it requires.
  const ordered: DemoEntity[] = [];
  const pending = candidates.map(describe);
  while (pending.length) {
    const next = pending.findIndex((entity) =>
      entity.relations.every(
        (relation) =>
          !relation.required ||
          relation.target === entity.model ||
          !pending.some((other) => other.model === relation.target),
      ),
    );
    if (next < 0) break; // A required cycle cannot be seeded; the rest is skipped.
    ordered.push(...pending.splice(next, 1));
  }
  return ordered;
}

export function demoDataFiles(ctx: GenerationContext): GeneratedProjectFile[] {
  const entities = demoEntities(ctx.plan).map((entity) =>
    ctx.demoValues?.[entity.model]?.length
      ? { ...entity, samples: ctx.demoValues[entity.model] }
      : entity,
  );
  return [
    file(
      'apps/api/src/seed/demo-data.ts',
      `import { PrismaService } from '../prisma/prisma.service';

// Demonstration data derived from the plan (DEC-159): a few records per
// creatable entity, in dependency order. An entity that already has records
// is left as it is, so it can run again. A record that breaks a rule is skipped.
type Field = { name: string; label: string; type: string; required: boolean; unique: boolean; enumValues: string[]; value?: string | number | boolean };
type Entity = { model: string; delegate: string; fields: Field[]; relations: { name: string; target: string; required: boolean; unique: boolean }[]; samples?: Record<string, string | number | boolean>[] };
const ENTITIES: Entity[] = ${JSON.stringify(entities, null, 1)};
const RECORDS = 3;

// A realistic sample value when the plan's demonstration set has one,
// otherwise a placeholder that satisfies the field's type.
function value(field: Field, index: number, sample?: Record<string, string | number | boolean>): unknown {
  if (field.value !== undefined) return field.value;
  const given = sample?.[field.name];
  if (given !== undefined) return field.type === 'DATE' || field.type === 'DATETIME' ? new Date(String(given)) : given;
  const day = new Date(Date.UTC(2026, 0, 1 + index * 3));
  switch (field.type) {
    case 'STRING': return \`\${field.label} \${index}\`.slice(0, 120);
    case 'TEXT': return \`\${field.label}: registro de demostración \${index}.\`;
    case 'INT': return index * 5;
    case 'DECIMAL': return (index * 12.5).toFixed(2);
    case 'BOOLEAN': return index % 2 === 1;
    case 'DATE': return day;
    case 'DATETIME': return new Date(day.getTime() + index * 3_600_000);
    case 'ENUM': return field.enumValues[(index - 1) % field.enumValues.length];
  }
  return null;
}

async function main() {
  const prisma = new PrismaService();
  const db = prisma as unknown as Record<string, { count(): Promise<number>; findMany(args: unknown): Promise<{ id: string }[]>; create(args: unknown): Promise<{ id: string }> }>;
  const summary: Record<string, number> = {};
  try {
    for (const entity of ENTITIES) {
      if (await db[entity.delegate]!.count()) continue;
      // Records each relation may point to: existing rows of the target.
      const targets: Record<string, string[]> = {};
      for (const relation of entity.relations) {
        const target = ENTITIES.find((item) => item.model === relation.target)?.delegate ?? relation.target.charAt(0).toLowerCase() + relation.target.slice(1);
        targets[relation.name] = (await db[target]?.findMany({ select: { id: true }, take: RECORDS }) ?? []).map((row) => row.id);
      }
      if (entity.relations.some((relation) => relation.required && !targets[relation.name]!.length)) continue;
      let created = 0;
      const count = Math.max(RECORDS, entity.samples?.length ?? 0);
      for (let index = 1; index <= count; index++) {
        const data: Record<string, unknown> = {};
        for (const field of entity.fields) data[field.name] = value(field, index, entity.samples?.[index - 1]);
        let skip = false;
        for (const relation of entity.relations) {
          const ids = targets[relation.name]!;
          const id = relation.unique ? ids[index - 1] : ids[(index - 1) % Math.max(ids.length, 1)];
          if (id) data[relation.name + 'Id'] = id;
          else if (relation.required) skip = true;
        }
        if (skip) continue;
        try { await db[entity.delegate]!.create({ data }); created++; } catch { /* Skipped: it breaks a rule of the model. */ }
      }
      summary[entity.model] = created;
    }
    console.log(JSON.stringify(summary));
  } finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error('Demo data could not be prepared.'); process.exitCode = 1; });
`,
      {
        origin: 'DETERMINISTIC',
        kind: 'SOURCE',
        planElements: entities.map(
          (entity) =>
            `entity:${ctx.plan.entities.find((item) => item.name === entity.model)!.localId}`,
        ),
      },
    ),
  ];
}

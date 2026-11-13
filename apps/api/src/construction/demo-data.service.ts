import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import { demoEntities } from '../code-generation/engine/demo-data.templates';
import { file, json, type GeneratedProjectFile } from '../code-generation/engine/types';

export const DEMO_DATA_VERSION = 3;
const RECORDS = 6;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const logger = new Logger('DemoDataService');

// Values travel as strings and are converted by each field's type below.
export const demoDataSchema = z
  .object({
    entities: z
      .array(
        z
          .object({
            model: z.string().max(100),
            records: z
              .array(
                z
                  .object({
                    values: z
                      .array(z.object({ field: z.string().max(100), value: z.string().max(500) }).strict())
                      .max(60),
                  })
                  .strict(),
              )
              .max(RECORDS),
          })
          .strict(),
      )
      .max(150),
  })
  .strict();
type Proposal = z.infer<typeof demoDataSchema>;
type Values = Record<string, Record<string, string | number | boolean>[]>;
type Entity = ReturnType<typeof demoEntities>[number];

// The currency the plan works in: the ISO code its text names most often.
export function planCurrency(plan: ImplementationPlanContent): string | undefined {
  const counts = new Map<string, number>();
  for (const match of JSON.stringify(plan).matchAll(/\b(USD|EUR|MXN|COP|PEN|ARS|CLP|BRL|GBP|CAD|GTQ|BOB|UYU|PYG|DOP|CRC|HNL|NIO|PAB|VES)\b/g))
    counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Keeps only values that satisfy their field: unknown fields, wrong types,
// enum values outside the plan and repeated unique values are dropped, so a
// proposal can never produce a record the model would reject for its shape.
export function acceptedDemoValues(entities: Entity[], proposal: Proposal, currency?: string): Values {
  const result: Values = {};
  for (const entity of entities) {
    const proposed = proposal.entities.find((item) => item.model === entity.model);
    if (!proposed) continue;
    const seen = new Map<string, Set<string>>();
    const records = proposed.records.map((record) => {
      const values: Record<string, string | number | boolean> = {};
      for (const { field: name, value: raw } of record.values) {
        const field = entity.fields.find((item) => item.name === name);
        if (!field || field.value !== undefined) continue;
        // A currency field always holds the plan's currency.
        const text = currency && field.type === 'STRING' && /currency|moneda/i.test(name) ? currency : raw.trim();
        let value: string | number | boolean | undefined;
        switch (field.type) {
          case 'STRING':
            value = text && text.length <= 120 ? text : undefined;
            break;
          case 'TEXT':
            value = text || undefined;
            break;
          case 'INT':
            value = /^-?\d{1,9}$/.test(text) ? Number(text) : undefined;
            break;
          case 'DECIMAL':
            value = /^-?\d{1,10}(\.\d{1,2})?$/.test(text) ? text : undefined;
            break;
          case 'BOOLEAN':
            value = text === 'true' ? true : text === 'false' ? false : undefined;
            break;
          case 'DATE':
            value = /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? text : undefined;
            break;
          case 'DATETIME':
            value = !Number.isNaN(Date.parse(text)) && /^\d{4}-\d{2}-\d{2}T/.test(text) ? new Date(text).toISOString() : undefined;
            break;
          case 'ENUM':
            value = field.enumValues.includes(text) ? text : undefined;
            break;
        }
        if (value === undefined) continue;
        if (field.unique) {
          const used = seen.get(name) ?? new Set<string>();
          if (used.has(String(value))) continue;
          used.add(String(value));
          seen.set(name, used);
        }
        values[name] = value;
      }
      return values;
    });
    const kept = records.filter((values) => Object.keys(values).length);
    if (kept.length) result[entity.model] = kept;
  }
  return result;
}

// Realistic demonstration values for a plan (DEC-159), proposed by AI once per
// data model and kept as a checkpoint. Without AI the deterministic
// placeholders remain: the project is still seeded and deployable.
@Injectable()
export class DemoDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
  ) {}

  async propose(
    projectId: string,
    designBaselineId: string,
    generationRunId: string,
    projectName: string,
    plan: ImplementationPlanContent,
  ): Promise<{ values?: Values; checkpoint?: GeneratedProjectFile; warning?: string }> {
    const entities = demoEntities(plan, true);
    if (!entities.length) return {};
    const request = {
      projectName,
      currency: planCurrency(plan) ?? null,
      modules: plan.modules.map((module) => ({ name: module.name, description: module.description })),
      entities: entities.map((entity) => ({
        model: entity.model,
        fields: entity.fields
          .filter((field) => field.value === undefined)
          .map(({ name, label, type, required, unique, enumValues }) => ({ name, label, type, required, unique, enumValues })),
      })),
      recordsPerEntity: RECORDS,
    };
    const path = `docs/demo-data/${hash(json({ version: DEMO_DATA_VERSION, request }))}.json`;
    const cached = await this.prisma.generatedFile.findFirst({
      where: { path, generationRun: { projectId, designBaselineId } },
      select: { content: true },
    });
    let proposal: Proposal;
    if (cached) proposal = demoDataSchema.parse(JSON.parse(cached.content));
    else {
      try {
        const result = await this.ai.generateStructured({
          projectId,
          language: await getProjectLanguage(this.prisma, projectId),
          promptKey: 'demo-data.generate',
          promptVersion: DEMO_DATA_VERSION,
          messages: [{ role: 'user', content: json(request) }],
          outputSchema: demoDataSchema,
          schemaName: 'demo_data',
          maxOutputTokens: 16000,
        });
        proposal = demoDataSchema.parse(result.data);
      } catch (error) {
        if (!(error instanceof AIError)) throw error;
        logger.warn(`Demo data proposal unavailable: ${error.message}`);
        return {
          warning:
            'Los datos de demostración usan valores genéricos porque el proveedor de IA no estuvo disponible.',
        };
      }
    }
    const checkpoint = file(path, json(proposal), { kind: 'DOCUMENTATION', origin: 'AI_ASSISTED' });
    await this.prisma.generatedFile.upsert({
      where: { generationRunId_path: { generationRunId, path } },
      update: {},
      create: {
        generationRunId,
        path,
        content: checkpoint.content,
        kind: 'DOCUMENTATION',
        origin: 'AI_ASSISTED',
        sha256: hash(checkpoint.content),
      },
    });
    return { values: acceptedDemoValues(entities, proposal, request.currency ?? undefined), checkpoint };
  }
}

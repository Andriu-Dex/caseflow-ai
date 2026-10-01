import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import {
  diagnosedFiles,
  importSpecifiers,
  reviewRepairPatch,
  sha256,
  type ProjectFile,
} from './project-validation';

const logger = new Logger('AutoRepairService');

const repairOutputSchema = z
  .object({
    explanation: z.string().trim().min(1).max(2000),
    files: z
      .array(
        z.object({ path: z.string().min(1).max(300), content: z.string().max(60000) }).strict(),
      )
      .max(5),
    findings: z
      .array(
        z
          .object({
            message: z.string().trim().min(1).max(1000),
            relatedSourceCode: z.string().max(40).optional(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

// Only code-level stages can be repaired; a failed structural or traceability
// check comes from the generator or the plan and needs a person.
const REPAIRABLE = new Set(['LINT', 'TYPECHECK', 'TEST', 'BUILD']);
const MAX_DIAGNOSTIC_CHARS = 8000;

export interface RepairInput {
  projectId: string;
  failedStage: string;
  output: string;
  files: readonly ProjectFile[];
  // Artifact code (e.g. "UI-002") -> exact approved version the run was built on.
  versionsByCode: ReadonlyMap<string, string>;
}

export interface RepairResult {
  status: 'PATCHED' | 'NO_PATCH' | 'REJECTED';
  explanation: string;
  patches: { path: string; previousSha256: string; content: string; sha256: string }[];
  findings: { message: string; relatedArtifactVersionId: string | null }[];
}

// One bounded repair round (spec §176): structured diagnosis in, focused
// file replacements out, reviewed before anything is applied. The caller owns
// the round limit; this never loops.
@Injectable()
export class AutoRepairService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
  ) {}

  async repair(input: RepairInput): Promise<RepairResult> {
    const none = (explanation: string): RepairResult => ({
      status: 'NO_PATCH',
      explanation,
      patches: [],
      findings: [],
    });
    if (!REPAIRABLE.has(input.failedStage))
      return none('Esta etapa no se repara automáticamente: requiere revisión humana.');
    const candidates = diagnosedFiles(input.files, input.output);
    if (!candidates.length)
      return none('El diagnóstico no señala archivos fuente que se puedan reparar.');

    let proposal: z.infer<typeof repairOutputSchema>;
    try {
      const result = await this.ai.generateStructured({
        projectId: input.projectId,
        language: await getProjectLanguage(this.prisma, input.projectId),
        promptKey: 'code-repair.generate',
        promptVersion: 1,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              failedStage: input.failedStage,
              diagnostics: input.output.slice(-MAX_DIAGNOSTIC_CHARS),
              files: candidates.map((f) => ({ path: f.path, content: f.content })),
            }),
          },
        ],
        outputSchema: repairOutputSchema,
        schemaName: 'code_repair',
        maxOutputTokens: 8192,
      });
      proposal = result.data;
    } catch (error) {
      if (!(error instanceof AIError)) throw error;
      logger.warn(`Repair not generated: ${error.message}`);
      return none('El servicio de IA no está disponible para proponer una reparación.');
    }

    const findings = proposal.findings.map((f) => ({
      message: f.message,
      relatedArtifactVersionId: f.relatedSourceCode
        ? (input.versionsByCode.get(f.relatedSourceCode) ?? null)
        : null,
    }));
    const byPath = new Map(candidates.map((f) => [f.path, f]));
    const knownImports = new Set(input.files.flatMap((f) => [...importSpecifiers(f.content)]));
    const rejection = proposal.files
      .map((patch) => reviewRepairPatch(patch, byPath, knownImports))
      .find((reason) => reason !== null);
    if (rejection)
      return {
        status: 'REJECTED',
        explanation: `La propuesta se descartó: ${rejection}.`,
        patches: [],
        findings,
      };
    const patches = proposal.files
      .filter((p) => p.content !== byPath.get(p.path)!.content)
      .map((p) => ({
        path: p.path,
        previousSha256: sha256(byPath.get(p.path)!.content),
        content: p.content,
        sha256: sha256(p.content),
      }));
    return patches.length
      ? { status: 'PATCHED', explanation: proposal.explanation, patches, findings }
      : { status: 'NO_PATCH', explanation: proposal.explanation, patches: [], findings };
  }
}

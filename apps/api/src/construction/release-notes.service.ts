import { Injectable, NotFoundException } from '@nestjs/common';
import type { ReleaseNotesResponse } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { AcceptanceService } from './acceptance.service';
import { planForRun } from './delivery-scope';

type Notes = Omit<ReleaseNotesResponse, 'markdown'>;

const dateOf = (value: Date) =>
  value.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });

// DEC-173: the notes of a delivery or construction, built without AI from
// what CASEFlow knows: the use cases its screens realize per role, its
// requirements' acceptance, its running demonstration and what changed since
// the previous one (the earlier delivery, or the previous construction).
@Injectable()
export class ReleaseNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceptance: AcceptanceService,
  ) {}

  async notes(projectId: string, runId: string): Promise<ReleaseNotesResponse> {
    const run = await this.prisma.generationRun.findFirst({
      where: { id: runId, projectId },
      select: {
        id: true,
        createdAt: true,
        implementationPlanVersionId: true,
        deliveryId: true,
        delivery: { select: { position: true, name: true, deliveryPlanId: true } },
        snapshot: { select: { id: true } },
        project: { select: { name: true } },
      },
    });
    if (!run) throw new NotFoundException('Corrida de construcción no encontrada.');
    const report = await this.acceptance.report(projectId, run.id);
    const previous = await this.previous(projectId, run);
    const [screens, previousScreens] = await Promise.all([
      this.screensOf(projectId, run),
      previous ? this.screensOf(projectId, previous.run) : Promise.resolve([]),
    ]);
    const previousCases = previous
      ? new Set(
          (await this.acceptance.report(projectId, previous.run.id)).criteria.map(
            (c) => c.useCaseName,
          ),
        )
      : new Set<string>();

    const byRole = new Map<string, string[]>();
    for (const criterion of report.criteria) {
      const role = criterion.role || 'Sin iniciar sesión';
      byRole.set(role, [...(byRole.get(role) ?? []), criterion.useCaseName]);
    }
    const deployment = run.snapshot
      ? await this.prisma.generatedProjectDeployment.findFirst({
          where: { projectId, snapshotId: run.snapshot.id, status: 'RUNNING' },
          orderBy: { createdAt: 'desc' },
          select: { publicUrl: true, accounts: true },
        })
      : null;
    const count = (status: string) =>
      report.requirements.filter((requirement) => requirement.status === status).length;

    const notes: Notes = {
      title: run.delivery
        ? `${run.project.name}: entrega ${run.delivery.position}, ${run.delivery.name}`
        : `${run.project.name}: construcción del ${dateOf(run.createdAt)}`,
      delivery: run.delivery ? { position: run.delivery.position, name: run.delivery.name } : null,
      canDo: [...byRole].map(([role, useCases]) => ({ role, useCases })),
      requirements: {
        passed: report.requirements
          .filter((requirement) => requirement.status === 'PASSED')
          .map(({ code, title }) => ({ code, title })),
        failed: count('FAILED'),
        notRun: count('NOT_RUN'),
        withoutCriteria: count('NO_CRITERIA'),
      },
      demo: deployment
        ? {
            url: deployment.publicUrl,
            accounts: (
              deployment.accounts as { role: string; identifier: string; name?: string }[]
            ).map((account) => ({
              role: account.role,
              identifier: account.identifier,
              name: account.name ?? null,
            })),
          }
        : null,
      changes: {
        since: previous?.label ?? null,
        newScreens: screens.filter((name) => !previousScreens.includes(name)),
        newUseCases: report.criteria
          .map((criterion) => criterion.useCaseName)
          .filter((name) => !previousCases.has(name)),
      },
    };
    return { ...notes, markdown: markdownOf(notes) };
  }

  // The earlier delivery's approved run, or the previous construction.
  private async previous(
    projectId: string,
    run: {
      createdAt: Date;
      delivery: { position: number; deliveryPlanId: string } | null;
    },
  ) {
    const select = { id: true, implementationPlanVersionId: true, deliveryId: true } as const;
    if (run.delivery) {
      if (run.delivery.position === 0) return null;
      const earlier = await this.prisma.delivery.findFirst({
        where: { deliveryPlanId: run.delivery.deliveryPlanId, position: run.delivery.position - 1 },
        select: {
          position: true,
          approvals: {
            orderBy: { approvedAt: 'desc' },
            take: 1,
            select: { generationRun: { select } },
          },
        },
      });
      const approved = earlier?.approvals[0]?.generationRun;
      return approved ? { run: approved, label: `la entrega ${earlier!.position}` } : null;
    }
    const before = await this.prisma.generationRun.findFirst({
      where: { projectId, status: 'GENERATED', createdAt: { lt: run.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { ...select, createdAt: true },
    });
    return before
      ? { run: before, label: `la construcción del ${dateOf(before.createdAt)}` }
      : null;
  }

  private async screensOf(
    projectId: string,
    run: { implementationPlanVersionId: string; deliveryId: string | null },
  ) {
    const plan = await planForRun(this.prisma, projectId, run);
    return [...new Set(plan.routes.map((route) => route.screenName))];
  }
}

function markdownOf(notes: Notes): string {
  const lines = [`# ${notes.title}`, ''];
  lines.push('## Qué se puede hacer', '');
  if (notes.canDo.length)
    for (const { role, useCases } of notes.canDo) {
      lines.push(`**${role}**`, '');
      for (const useCase of useCases) lines.push(`- ${useCase}`);
      lines.push('');
    }
  else lines.push('Esta construcción aún no realiza casos de uso aprobados.', '');
  lines.push('## Requisitos', '');
  lines.push(
    `${notes.requirements.passed.length} cumplidos, ${notes.requirements.failed} fallidos, ${notes.requirements.notRun} sin probar y ${notes.requirements.withoutCriteria} sin criterio de aceptación.`,
    '',
  );
  for (const requirement of notes.requirements.passed)
    lines.push(`- ${requirement.code} ${requirement.title}`);
  if (notes.requirements.passed.length) lines.push('');
  lines.push('## Cómo probarlo', '');
  if (notes.demo) {
    if (notes.demo.url) lines.push(`Demostración: ${notes.demo.url}`, '');
    for (const account of notes.demo.accounts)
      lines.push(
        `- ${account.role}: ${account.identifier}${account.name ? ` (${account.name})` : ''}`,
      );
    lines.push('', 'La contraseña es la que se indicó al desplegar la demostración.', '');
  } else lines.push('Esta construcción no tiene una demostración en línea.', '');
  lines.push(
    notes.changes.since ? `## Novedades respecto de ${notes.changes.since}` : '## Novedades',
    '',
  );
  if (!notes.changes.since) lines.push('Es la primera entrega.', '');
  for (const screen of notes.changes.newScreens) lines.push(`- Pantalla nueva: ${screen}`);
  for (const useCase of notes.changes.newUseCases) lines.push(`- Ahora se puede: ${useCase}`);
  if (notes.changes.since && !notes.changes.newScreens.length && !notes.changes.newUseCases.length)
    lines.push('No hay pantallas ni casos de uso nuevos.');
  return `${lines.join('\n').trimEnd()}\n`;
}

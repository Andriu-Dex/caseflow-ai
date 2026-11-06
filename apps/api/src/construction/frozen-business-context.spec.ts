import { describe, expect, it, vi } from 'vitest';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { loadFrozenBusinessContext } from './frozen-business-context';

const projectId = 'project';
const baselineId = '11111111-1111-4111-8111-111111111111';
const plan = implementationPlanContentSchema.parse({
  designBaselineId: baselineId,
  authentication: { required: false },
  modules: [{ localId: 'loans', name: 'Loans', description: 'Préstamos' }],
  entities: [
    {
      localId: 'loan',
      name: 'Loan',
      moduleLocalId: 'loans',
      fields: [{ name: 'state', type: 'STRING' }],
    },
  ],
  customEndpoints: [{ moduleLocalId: 'loans', method: 'POST', path: '/loans', summary: 'Prestar' }],
  routes: [
    {
      path: '/loans/new',
      screenName: 'Prestar',
      screenLocalId: 'loan',
      moduleLocalId: 'loans',
      kind: 'FORM',
      actions: [{ label: 'Prestar', endpoint: 'POST /loans' }],
    },
  ],
});
const entry = (role: string, content: unknown, sources: string[] = []) => ({
  role,
  artifactVersion: {
    projectId,
    structuredAnalysisDetail: {
      content,
      generation: { sources: sources.map((artifactVersionId) => ({ artifactVersionId })) },
    },
  },
});
const setup = () => {
  const baseline = {
    entries: [
      entry(
        'GENERATION_PLAN',
        {
          summary: 'Biblioteca',
          authentication: { required: false },
          modules: [
            {
              localId: 'loans',
              name: 'Préstamos',
              purpose: 'Controlar préstamos',
              relatedRequirementCodes: ['RF-001'],
              relatedUseCaseCodes: ['CU-001'],
            },
          ],
        },
        ['rf-v1', 'cu-v1', 'rnf-v1'],
      ),
      entry('UI_BLUEPRINT', {
        screens: [
          {
            localId: 'loan',
            name: 'Prestar',
            purpose: 'Prestar un libro',
            relatedUseCaseCodes: ['CU-001'],
          },
        ],
      }),
    ],
  };
  const prisma = {
    designBaseline: { findFirst: vi.fn().mockResolvedValue(baseline) },
    artifactVersion: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'rf-v1',
          artifact: { code: 'RF-001' },
          requirementDetail: {
            name: 'Límite',
            description: 'Máximo tres préstamos.',
            requirementType: 'FUNCTIONAL',
            preconditions: [],
            postconditions: [],
          },
        },
        {
          id: 'rnf-v1',
          artifact: { code: 'RNF-001' },
          requirementDetail: {
            name: 'Auditoría',
            description: 'Conservar 365 días.',
            requirementType: 'NON_FUNCTIONAL',
            preconditions: [],
            postconditions: [],
          },
        },
        {
          id: 'cu-v1',
          artifact: { code: 'CU-001' },
          useCaseDetail: {
            name: 'Prestar',
            objective: 'Prestar un libro disponible',
            primaryActor: 'Encargado',
            requirementLinks: [{ requirementVersionId: 'rf-v1' }],
            preconditions: [],
            postconditions: [],
            mainFlowSteps: [{ actor: 'Sistema', action: 'Comprobar el límite de préstamos.' }],
            alternativeFlows: [
              {
                name: 'Límite',
                condition: 'Tres activos',
                steps: [{ actor: 'Sistema', action: 'Rechazar sin guardar.' }],
              },
            ],
          },
        },
      ]),
    },
  };
  return { prisma, baseline };
};

describe('frozen business context', () => {
  it('keeps exact source versions, complete rules, alternative flows and cross-cutting nonfunctional constraints', async () => {
    const { prisma } = setup();
    const select = await loadFrozenBusinessContext(prisma as never, projectId, baselineId);
    const context = select(plan.customEndpoints[0]!, plan);
    expect(prisma.artifactVersion.findMany.mock.calls[0]![0].where).toMatchObject({
      projectId,
      id: { in: ['rf-v1', 'cu-v1', 'rnf-v1'] },
      status: 'APPROVED',
      artifact: { artifactTypeCode: { in: ['REQUIREMENT', 'USE_CASE'] } },
    });
    expect(context.requirements.map((item) => item.description)).toEqual([
      'Máximo tres préstamos.',
      'Conservar 365 días.',
    ]);
    expect(context.useCases[0]!.alternatives[0]!.steps[0]!.action).toBe('Rechazar sin guardar.');
    expect(context.screens).toHaveLength(1);
  });
  it('rejects another project before reading analysis', async () => {
    const { prisma, baseline } = setup();
    baseline.entries[0]!.artifactVersion.projectId = 'other-project';
    await expect(loadFrozenBusinessContext(prisma as never, projectId, baselineId)).rejects.toThrow(
      'proyecto',
    );
    expect(prisma.artifactVersion.findMany).not.toHaveBeenCalled();
  });
});

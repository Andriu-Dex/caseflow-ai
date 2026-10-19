import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignBaselinesService } from './design-baselines.service';

const id = (role: string) => `v-${role}`;
const version = (
  role: string,
  extra: Partial<{
    status: string;
    mockupDetail: { uiBlueprintVersionId: string; designThemeVersionId: string | null } | null;
  }> = {},
) => ({
  id: id(role),
  status: 'APPROVED',
  artifact: { artifactTypeCode: role },
  mockupDetail: null,
  ...extra,
});
const entryRow = (role: string) => ({
  role,
  artifactVersion: {
    id: id(role),
    versionNumber: 1,
    title: `Título ${role}`,
    artifact: { id: `a-${role}`, code: `${role}-001` },
  },
});

describe('DesignBaselinesService', () => {
  const tx = {
    designBaseline: { create: vi.fn(), findUniqueOrThrow: vi.fn() },
    designBaselineEntry: { create: vi.fn() },
  };
  const prisma = {
    project: { findUnique: vi.fn() },
    artifactVersion: { findMany: vi.fn() },
    designBaseline: { findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const consistency = { assertDesignCoherent: vi.fn() };
  const currency = { assertCurrent: vi.fn() };
  const service = new DesignBaselinesService(
    prisma as never,
    audit as never,
    consistency as never,
    currency as never,
  );
  const roles = ['GENERATION_PLAN', 'CONCEPTUAL_DOMAIN_MODEL', 'NAVIGATION_TREE', 'UI_BLUEPRINT'];
  const input = (extra: Record<string, string> = {}) => ({
    label: 'Diseño v1',
    versions: Object.fromEntries([...roles, ...Object.keys(extra)].map((role) => [role, id(role)])),
  });

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.project.findUnique.mockResolvedValue({
      designThemeRequired: false,
      coherenceRequired: false,
    });
    prisma.artifactVersion.findMany.mockResolvedValue(roles.map((role) => version(role)));
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    tx.designBaseline.create.mockResolvedValue({ id: 'b1', label: 'Diseño v1' });
    tx.designBaseline.findUniqueOrThrow.mockResolvedValue({
      id: 'b1',
      projectId: 'p1',
      label: 'Diseño v1',
      note: null,
      approvedByUserId: 'user',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      entries: [entryRow('UI_BLUEPRINT'), entryRow('GENERATION_PLAN')],
    });
    consistency.assertDesignCoherent.mockResolvedValue(undefined);
    currency.assertCurrent.mockResolvedValue(undefined);
    audit.record.mockResolvedValue(undefined);
  });

  it('freezes the approved design, records it and returns its entries in role order', async () => {
    const baseline = await service.create('p1', 'user', input() as never);
    expect(baseline.entries.map((entry) => entry.role)).toEqual([
      'GENERATION_PLAN',
      'UI_BLUEPRINT',
    ]);
    expect(tx.designBaselineEntry.create).toHaveBeenCalledTimes(roles.length);
    // The blueprint is inserted before the mockup: the database checks one against the other.
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DESIGN_BASELINE_APPROVED', actorUserId: 'user' }),
      tx,
    );
    expect(consistency.assertDesignCoherent).toHaveBeenCalledWith('p1', roles.map(id));
    expect(currency.assertCurrent).toHaveBeenCalled();
  });

  it('keeps the approval origin of a bulk approval', async () => {
    await service.create('p1', 'user', input() as never, 'HUMAN_BULK');
    expect(tx.designBaseline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ approvalOrigin: 'HUMAN_BULK', note: null }),
    });
  });

  it('requires the theme and the class diagram in projects that need them', async () => {
    prisma.project.findUnique.mockResolvedValue({
      designThemeRequired: true,
      coherenceRequired: false,
    });
    await expect(service.create('p1', 'user', input() as never)).rejects.toThrow('tema aprobado');
    prisma.project.findUnique.mockResolvedValue({
      designThemeRequired: false,
      coherenceRequired: true,
    });
    await expect(service.create('p1', 'user', input() as never)).rejects.toThrow(
      'diagrama de clases',
    );
    expect(tx.designBaseline.create).not.toHaveBeenCalled();
  });

  it('refuses a version that does not exist, is of another type, or is not approved', async () => {
    prisma.artifactVersion.findMany.mockResolvedValue(roles.slice(1).map((role) => version(role)));
    await expect(service.create('p1', 'user', input() as never)).rejects.toThrow(
      'plan de generación no existe en este proyecto',
    );
    prisma.artifactVersion.findMany.mockResolvedValue(
      roles.map((role) =>
        role === 'NAVIGATION_TREE'
          ? { ...version(role), artifact: { artifactTypeCode: 'MOCKUP' } }
          : version(role),
      ),
    );
    await expect(service.create('p1', 'user', input() as never)).rejects.toThrow(
      'la navegación no existe',
    );
    prisma.artifactVersion.findMany.mockResolvedValue(
      roles.map((role) =>
        role === 'UI_BLUEPRINT' ? version(role, { status: 'DRAFT' }) : version(role),
      ),
    );
    await expect(service.create('p1', 'user', input() as never)).rejects.toThrow(
      'Apruebe el plano de interfaz antes de congelar',
    );
  });

  describe('the mockup it freezes', () => {
    const withMockup = (
      detail: { uiBlueprintVersionId: string; designThemeVersionId: string | null } | null,
    ) =>
      prisma.artifactVersion.findMany.mockResolvedValue([
        ...roles.map((role) => version(role)),
        version('MOCKUP', { mockupDetail: detail }),
      ]);

    it('must come from the selected blueprint and theme', async () => {
      withMockup({ uiBlueprintVersionId: 'otro', designThemeVersionId: null });
      await expect(service.create('p1', 'user', input({ MOCKUP: '' }) as never)).rejects.toThrow(
        'a partir de la versión seleccionada del plano',
      );

      withMockup({ uiBlueprintVersionId: id('UI_BLUEPRINT'), designThemeVersionId: 'otro-tema' });
      await expect(service.create('p1', 'user', input({ MOCKUP: '' }) as never)).rejects.toThrow(
        'El boceto se generó con un tema: inclúyalo',
      );

      prisma.artifactVersion.findMany.mockResolvedValue([
        ...roles.map((role) => version(role)),
        version('DESIGN_THEME'),
        version('MOCKUP', {
          mockupDetail: {
            uiBlueprintVersionId: id('UI_BLUEPRINT'),
            designThemeVersionId: 'otro-tema',
          },
        }),
      ]);
      await expect(
        service.create('p1', 'user', input({ DESIGN_THEME: '', MOCKUP: '' }) as never),
      ).rejects.toThrow('con la versión seleccionada del tema');
    });

    it('is accepted when it matches the blueprint and has no theme', async () => {
      withMockup({ uiBlueprintVersionId: id('UI_BLUEPRINT'), designThemeVersionId: null });
      await expect(
        service.create('p1', 'user', input({ MOCKUP: '' }) as never),
      ).resolves.toBeDefined();
    });
  });

  it('lists the baselines of a project, and gets or gates one of that project only', async () => {
    const row = {
      id: 'b1',
      projectId: 'p1',
      label: 'L',
      note: 'n',
      approvedByUserId: 'user',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      entries: [entryRow('GENERATION_PLAN')],
    };
    prisma.designBaseline.findMany.mockResolvedValue([row]);
    expect((await service.list('p1')).items).toHaveLength(1);

    prisma.designBaseline.findFirst.mockResolvedValue(row);
    expect((await service.get('p1', 'b1')).label).toBe('L');
    expect((await service.assertApproved('p1', 'b1')).id).toBe('b1');

    prisma.designBaseline.findFirst.mockResolvedValue(null);
    await expect(service.get('other', 'b1')).rejects.toThrow('no encontrada');
    await expect(service.assertApproved('other', 'b1')).rejects.toThrow(
      'línea base de diseño aprobada',
    );
    expect(prisma.designBaseline.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'b1', projectId: 'other' } }),
    );
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalOriginBadge,
  UpgradeRouteButton,
  WorkflowRouteBadge,
  upgradeTargets,
} from './workflow-route';
import { TestProviders } from '../lib/test-utils';

const upgrade = vi.fn().mockResolvedValue({});
const projectGet = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    projects: {
      upgradeWorkflowRoute: (...args: unknown[]) => upgrade(...args),
      get: (...args: unknown[]) => projectGet(...args),
    },
  },
  restoreSession: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

describe('workflow routes (DEC-116)', () => {
  it('labels the route and only offers routes with more review', () => {
    render(<WorkflowRouteBadge route="BUILD_ONLY" />);
    expect(screen.getByText('Ruta Solo construcción')).toBeInTheDocument();
    expect(upgradeTargets('BUILD_ONLY')).toEqual(['EXPRESS', 'FULL']);
    expect(upgradeTargets('FULL')).toEqual([]);
  });

  it('upgrades only after confirming the chosen route', async () => {
    const user = userEvent.setup();
    const onUpgraded = vi.fn().mockResolvedValue(undefined);
    render(<UpgradeRouteButton projectId="p1" route="EXPRESS" onUpgraded={onUpgraded} />);
    await user.click(screen.getByRole('button', { name: /Subir de ruta/ }));
    expect(screen.getByText(/no se puede deshacer/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Subir a Completa' }));
    await waitFor(() => expect(onUpgraded).toHaveBeenCalled());
    expect(upgrade).toHaveBeenCalledWith('p1', 'FULL');
  });

  it('offers nothing to a project already on the full route', () => {
    const { container } = render(
      <UpgradeRouteButton projectId="p1" route="FULL" onUpgraded={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('marks automatic approvals as pending human review once the route moved up', async () => {
    window.localStorage.setItem('caseflow.activeProjectId', 'p1');
    projectGet.mockResolvedValue({ id: 'p1', workflowRoute: 'EXPRESS' });
    render(
      <TestProviders>
        <ApprovalOriginBadge origin="AUTOMATIC" />
        <ApprovalOriginBadge origin="HUMAN_BULK" />
        <ApprovalOriginBadge origin="HUMAN" />
      </TestProviders>,
    );
    expect(
      await screen.findByText('Aprobado automáticamente — pendiente de revisión humana'),
    ).toBeInTheDocument();
    expect(screen.getByText('Aprobado en bloque')).toBeInTheDocument();
  });
});

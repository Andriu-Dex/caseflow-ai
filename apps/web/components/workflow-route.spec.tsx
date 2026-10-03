import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpgradeRouteButton, WorkflowRouteBadge, upgradeTargets } from './workflow-route';

const upgrade = vi.fn().mockResolvedValue({});

vi.mock('../lib/api', () => ({
  api: { projects: { upgradeWorkflowRoute: (...args: unknown[]) => upgrade(...args) } },
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
});

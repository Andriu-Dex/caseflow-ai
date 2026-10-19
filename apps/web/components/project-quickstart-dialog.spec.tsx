import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectQuickstartDialog, HIDE_QUICKSTART_KEY } from './project-quickstart-dialog';

describe('ProjectQuickstartDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders quickstart dialog with title, stepper, prerequisites, and copy commands', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ProjectQuickstartDialog
        open={true}
        onOpenChange={onOpenChange}
        targetTemplateIdentifier="CASEFLOW_WEB_TS_V1"
        targetTemplateVersion={1}
        primaryRole="ADMIN"
        requiresAuth={true}
      />,
    );

    expect(screen.getByText('¿Cómo probar el proyecto en tu máquina?')).toBeInTheDocument();
    expect(screen.getByText(/1\. Preparación/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Base de Datos/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. ¡A rodar!/i)).toBeInTheDocument();

    // Check prerequisites chips
    expect(screen.getByText(/Node\.js/i)).toBeInTheDocument();
    expect(screen.getByText(/pnpm ≥ 9/i)).toBeInTheDocument();
    expect(screen.getByText(/Docker Desktop/i)).toBeInTheDocument();

    // All steps are visible in continuous stepper
    expect(
      screen.getByText('docker compose -f docker/docker-compose.yml up -d'),
    ).toBeInTheDocument();
    expect(screen.getByText('pnpm --filter ./apps/api run dev-token -- ADMIN')).toBeInTheDocument();
    expect(screen.getByText('pnpm run dev')).toBeInTheDocument();

    // Check copying full workflow
    const copyFullBtn = screen.getByRole('button', { name: /Copiar flujo completo/i });
    await user.click(copyFullBtn);
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('docker compose'));

    // Check closing dialog
    const closeBtn = screen.getByRole('button', { name: 'Cerrar guía' });
    await user.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('saves and clears "No volver a mostrar automáticamente al descargar" in localStorage', async () => {
    const user = userEvent.setup();

    render(<ProjectQuickstartDialog open={true} onOpenChange={vi.fn()} />);

    const checkbox = screen.getByLabelText(/No volver a mostrar automáticamente al descargar/i);
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(localStorage.getItem(HIDE_QUICKSTART_KEY)).toBe('true');

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(localStorage.getItem(HIDE_QUICKSTART_KEY)).toBeNull();
  });
});

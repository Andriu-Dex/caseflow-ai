import { devTokenCommand } from './project-quickstart-dialog';
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
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('pnpm')).toBeInTheDocument();
    expect(screen.getByText('Docker Desktop')).toBeInTheDocument();

    // All steps are visible in continuous stepper
    expect(screen.getByText('pnpm run setup')).toBeInTheDocument();
    expect(
      screen.getByText('pnpm --filter ./apps/api run dev-token -- "ADMIN"'),
    ).toBeInTheDocument();
    expect(screen.getByText('pnpm run dev')).toBeInTheDocument();
    expect(screen.getByText(/docker-compose.app.yml up --build/)).toBeInTheDocument();

    // Check copying full workflow
    const copyFullBtn = screen.getByRole('button', { name: /Copiar flujo completo/i });
    await user.click(copyFullBtn);
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('pnpm run setup'));

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

describe('devTokenCommand', () => {
  it('quotes a role with spaces and accents as one argument', () => {
    expect(devTokenCommand('Encargado de sucursal')).toBe(
      'pnpm --filter ./apps/api run dev-token -- "Encargado de sucursal"',
    );
  });
  it('never puts shell syntax from a role into the command', () => {
    const newline = String.fromCharCode(10);
    for (const role of [
      'Admin"; rm -rf ~; "',
      'a$(whoami)',
      'a`id`',
      'a & b',
      `a${newline}b`,
      '',
    ]) {
      expect(devTokenCommand(role)).toBe('pnpm --filter ./apps/api run dev-token -- "<rol>"');
    }
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { designThemeContrastIssues } from '@caseflow-ai/contracts';
import {
  DEFAULT_DARK_PALETTE,
  DEFAULT_LIGHT_PALETTE,
  DesignThemeManualForm,
  DesignThemePreview,
} from './design-theme';
import { TestProviders } from '../lib/test-utils';

const structuredCreate = vi.fn().mockResolvedValue({});

vi.mock('../lib/api', () => ({
  api: { structuredAnalysis: { create: (...args: unknown[]) => structuredCreate(...args) } },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

describe('design theme (DEC-118)', () => {
  it('starts manual themes from palettes that already pass WCAG AA', () => {
    expect(
      designThemeContrastIssues({ light: DEFAULT_LIGHT_PALETTE, dark: DEFAULT_DARK_PALETTE }),
    ).toEqual([]);
  });

  it('warns about low contrast in the preview', () => {
    const { rerender } = render(
      <DesignThemePreview
        content={{ name: 'Nítido', mode: 'LIGHT', light: DEFAULT_LIGHT_PALETTE }}
      />,
    );
    expect(screen.getByText(/Cumple el contraste mínimo/)).toBeInTheDocument();
    rerender(
      <DesignThemePreview
        content={{
          name: 'Gris',
          mode: 'LIGHT',
          light: { ...DEFAULT_LIGHT_PALETTE, foreground: '#eeeeee' },
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Paleta clara: el texto principal sobre el fondo',
    );
  });

  it('creates a theme manually with only the palettes its mode uses', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <DesignThemeManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByLabelText('Nombre del tema'), 'Océano');
    await user.selectOptions(screen.getByLabelText('Modo'), 'LIGHT');
    expect(screen.queryByText('Paleta oscura')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    expect(structuredCreate).toHaveBeenCalledWith('p1', 'DESIGN_THEME', 'Tema del proyecto', {
      name: 'Océano',
      description: undefined,
      mode: 'LIGHT',
      light: DEFAULT_LIGHT_PALETTE,
      dark: undefined,
    });
  });
});

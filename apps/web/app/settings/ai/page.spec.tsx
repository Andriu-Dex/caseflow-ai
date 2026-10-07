import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AISettingsPage from './page';
import { TestProviders } from '../../../lib/test-utils';
import type { CaseflowDesktop, ChatGPTStatus } from '../../../lib/desktop';

vi.mock('../../../lib/api', () => ({ restoreSession: vi.fn() }));

const status = (overrides: Partial<ChatGPTStatus> = {}): ChatGPTStatus => ({
  connected: true,
  email: 'ana@example.com',
  model: 'gpt-x',
  paused: false,
  active: true,
  configuredProvider: true,
  ...overrides,
});

function withDesktop(current: ChatGPTStatus) {
  const chatgpt = {
    status: vi.fn().mockResolvedValue(current),
    connect: vi.fn().mockResolvedValue({}),
    disconnect: vi.fn().mockResolvedValue({ revoked: true }),
    models: vi.fn().mockResolvedValue([
      { slug: 'gpt-x', displayName: 'GPT X' },
      { slug: 'gpt-y', displayName: 'GPT Y' },
    ]),
    selectModel: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    prefer: vi.fn().mockResolvedValue(undefined),
  };
  (window as Window & { caseflowDesktop?: CaseflowDesktop }).caseflowDesktop = { chatgpt };
  return chatgpt;
}

const renderPage = () =>
  render(
    <TestProviders>
      <AISettingsPage />
    </TestProviders>,
  );

afterEach(() => {
  delete (window as Window & { caseflowDesktop?: CaseflowDesktop }).caseflowDesktop;
});

// DEC-117: the ChatGPT plan, desktop edition only.
describe('AI settings', () => {
  it('sends web users to the desktop installer instead', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Continuar con ChatGPT/ }));
    expect(
      screen.getByText(/aplicaciones que se ejecutan en su propio equipo/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Descargar la aplicación/ })).toHaveAttribute(
      'href',
      'https://github.com/Andriu-Dex/caseflow-ai/releases',
    );
  });

  it('connects through the desktop app', async () => {
    const user = userEvent.setup();
    const chatgpt = withDesktop(status({ connected: false, email: null, active: false }));
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Continuar con ChatGPT/ }));
    await waitFor(() => expect(chatgpt.connect).toHaveBeenCalledOnce());
  });

  it('chooses the model from the plan and links to its usage', async () => {
    const user = userEvent.setup();
    const chatgpt = withDesktop(status());
    renderPage();
    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'GPT Y' });
    await user.selectOptions(screen.getByRole('combobox'), 'gpt-y');
    await waitFor(() => expect(chatgpt.selectModel).toHaveBeenCalledWith('gpt-y'));
    expect(screen.getByRole('link', { name: /Administrar uso/ })).toHaveAttribute(
      'href',
      'https://chatgpt.com/#settings',
    );
  });

  it('only leaves a paused plan for another provider after confirmation', async () => {
    const user = userEvent.setup();
    const chatgpt = withDesktop(status({ paused: true }));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('en pausa');
    await user.click(screen.getByRole('button', { name: /Usar el otro proveedor configurado/ }));
    expect(chatgpt.prefer).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sí, usar el otro proveedor' }));
    await waitFor(() => expect(chatgpt.prefer).toHaveBeenCalledWith(false));
    await user.click(screen.getByRole('button', { name: /Reanudar con ChatGPT/ }));
    await waitFor(() => expect(chatgpt.resume).toHaveBeenCalledOnce());
  });
});

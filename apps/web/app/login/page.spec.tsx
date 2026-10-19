import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    auth: {
      login: (...args: unknown[]) => mocks.login(...args),
    },
  },
  ApiError: class ApiError extends Error {},
}));

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.login.mockReset();
    mocks.push.mockReset();
  });

  it('renders branding and login form elements', () => {
    render(<LoginPage />);
    expect(screen.getByText('CASEFlow AI')).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
  });

  it('submits credentials and redirects to home on success', async () => {
    mocks.login.mockResolvedValue({ id: 'user-1' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Correo Electrónico/i), 'usuario@ejemplo.com');
    await user.type(screen.getByLabelText(/Contraseña/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /Iniciar Sesión/i }));

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith({
        email: 'usuario@ejemplo.com',
        password: 'Password123!',
      });
      expect(mocks.push).toHaveBeenCalledWith('/');
    });
  });
});

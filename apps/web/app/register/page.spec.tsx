import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './page';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    auth: {
      register: (...args: unknown[]) => mocks.register(...args),
    },
  },
  ApiError: class ApiError extends Error {},
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    mocks.register.mockReset();
    mocks.push.mockReset();
  });

  it('renders branding and registration form elements', () => {
    render(<RegisterPage />);
    expect(screen.getByText('CASEFlow AI')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirmar Contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registrarse/i })).toBeInTheDocument();
  });

  it('validates password match and registers account', async () => {
    mocks.register.mockResolvedValue({ id: 'user-2' });
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/Nombre/i), 'Ana Developer');
    await user.type(screen.getByLabelText(/Correo Electrónico/i), 'ana@ejemplo.com');
    await user.type(screen.getByLabelText(/^Contraseña/i), 'SuperSecret123!');
    await user.type(screen.getByLabelText(/Confirmar Contraseña/i), 'SuperSecret123!');
    await user.click(screen.getByRole('button', { name: /Registrarse/i }));

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledWith({
        displayName: 'Ana Developer',
        email: 'ana@ejemplo.com',
        password: 'SuperSecret123!',
      });
      expect(mocks.push).toHaveBeenCalledWith('/');
    });
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from './theme-toggle';
import { ThemeProvider } from './theme-provider';

describe('ThemeToggle', () => {
  it('renders the toggle button with high z-index and toggles theme on click', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = await screen.findByRole('button', { name: 'Alternar tema' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('z-[9999]');

    await user.click(button);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoActiveProject, RequireActiveProject } from './query-state';
import { TestProviders } from '../lib/test-utils';

describe('RequireActiveProject', () => {
  it('shows the zero-project empty state instead of rendering child content (behavior 1)', () => {
    render(
      <TestProviders>
        <RequireActiveProject>{() => <div>should not render</div>}</RequireActiveProject>
      </TestProviders>,
    );
    expect(screen.getByText(/seleccione o cree un proyecto/i)).toBeInTheDocument();
    expect(screen.queryByText('should not render')).not.toBeInTheDocument();
  });
});

describe('NoActiveProject', () => {
  it('renders a short, non-technical message', () => {
    render(<NoActiveProject />);
    expect(screen.getByText(/seleccione o cree un proyecto/i)).toBeInTheDocument();
  });
});

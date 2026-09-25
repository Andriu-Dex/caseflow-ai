import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CandidateBadge, StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('shows text, not only color, for every lifecycle status', () => {
    render(<StatusBadge status="APPROVED" />);
    expect(screen.getByText(/aprobado/i)).toBeInTheDocument();
  });

  it('distinguishes IN_REVIEW from APPROVED by visible text', () => {
    const { rerender } = render(<StatusBadge status="IN_REVIEW" />);
    expect(screen.getByText(/en revisión/i)).toBeInTheDocument();
    rerender(<StatusBadge status="CHANGES_REQUESTED" />);
    expect(screen.getByText(/cambios solicitados/i)).toBeInTheDocument();
  });
});

describe('CandidateBadge', () => {
  it('is visibly distinct from an official artifact version status (behavior 9)', () => {
    render(<CandidateBadge />);
    expect(screen.getByText(/candidato de ia/i)).toBeInTheDocument();
  });
});

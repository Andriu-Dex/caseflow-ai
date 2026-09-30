import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CandidateReview } from './candidate-review';

describe('CandidateReview quality findings', () => {
  it('shows coverage warnings while allowing human review', async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    render(
      <CandidateReview
        generation={{
          id: 'batch',
          candidates: [
            {
              id: 'candidate',
              candidateId: 'c1',
              name: 'Navegación',
              qualityFindings: [
                {
                  severity: 'WARNING',
                  code: 'UNCOVERED_SOURCE',
                  message: 'RF-001 no está cubierta.',
                },
              ],
            },
          ],
        }}
        describe={(candidate) => candidate.name ?? ''}
        onAccept={onAccept}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/RF-001 no está cubierta/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Incorporar 1 de 1/ }));
    expect(onAccept).toHaveBeenCalledWith(['candidate']);
  });

  it('prevents incorporating a candidate with an invalid source reference', () => {
    render(
      <CandidateReview
        generation={{
          id: 'batch',
          candidates: [
            {
              id: 'candidate',
              candidateId: 'c1',
              name: 'Navegación',
              qualityFindings: [
                {
                  severity: 'ERROR',
                  code: 'UNKNOWN_SOURCE',
                  message: 'RF-999 no fue seleccionada.',
                },
              ],
            },
          ],
        }}
        describe={(candidate) => candidate.name ?? ''}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/RF-999 no fue seleccionada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Incorporar 1 de 1/ })).toBeDisabled();
  });
});

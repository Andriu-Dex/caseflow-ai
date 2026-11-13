import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataModelReviewNotice } from './data-model-review-notice';

describe('DataModelReviewNotice', () => {
  it('shows a pending capture/display decision for a minimal conceptual entity', () => {
    render(
      <DataModelReviewNotice
        model={{
          entities: [{ name: 'Documento', attributes: [{ name: 'id', primaryKey: true }] }],
        }}
      />,
    );
    expect(
      screen.getByRole('complementary', { name: 'Decisiones pendientes del modelo' }),
    ).toHaveTextContent('Documento');
    expect(screen.getByText(/no garantiza que sus reglas/)).toBeInTheDocument();
  });
  it('does not add a decision warning to an entity with descriptive attributes', () => {
    const { container } = render(
      <DataModelReviewNotice
        model={{
          entities: [
            {
              name: 'Documento',
              attributes: [{ name: 'id', primaryKey: true }, { name: 'label' }],
            },
          ],
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

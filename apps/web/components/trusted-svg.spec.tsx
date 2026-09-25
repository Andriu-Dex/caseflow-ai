import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrustedDiagram } from './trusted-svg';

describe('TrustedDiagram (behavior 13: safe trusted diagram rendering)', () => {
  it('renders backend-provided SVG markup inside a figure', () => {
    const { container } = render(
      <TrustedDiagram svg="<svg><circle cx='1' cy='1' r='1'></circle></svg>" caption="ER-001" />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('figcaption')?.textContent).toBe('ER-001');
  });
});

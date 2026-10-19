import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfettiCelebration } from './confetti-celebration';

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    restore: vi.fn(),
  });
});

describe('ConfettiCelebration', () => {
  it('renders canvas element with pointer-events-none and fixed positioning', () => {
    const { container } = render(<ConfettiCelebration />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveClass('pointer-events-none');
    expect(canvas).toHaveClass('fixed');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('respects prefers-reduced-motion and completes immediately', () => {
    const onComplete = vi.fn();
    const originalMatchMedia = window.matchMedia;

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<ConfettiCelebration onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalled();

    window.matchMedia = originalMatchMedia;
  });
});

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => ({
    clearRect: () => {},
    save: () => {},
    translate: () => {},
    rotate: () => {},
    fillRect: () => {},
    restore: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

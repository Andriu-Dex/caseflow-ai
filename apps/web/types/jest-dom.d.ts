// @testing-library/jest-dom 6.6.3's own ambient `vitest` module augmentation
// declares `Assertion<T = any>` (one type parameter), but vitest 5's actual
// `Assertion<R, T>` interface takes two required parameters — declaration
// merging requires matching arity, so the upstream augmentation is silently
// dropped. This local override matches vitest 5's real shape instead.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional: adds TestingLibraryMatchers' members via interface merging
  interface Assertion<R, T> extends TestingLibraryMatchers<T, R> {}
}

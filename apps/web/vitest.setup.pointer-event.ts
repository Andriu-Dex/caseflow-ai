// jsdom has no PointerEvent constructor. This must run before react-dom is
// first imported (hence its own setupFiles entry, ahead of vitest.setup.ts —
// ES module imports are hoisted, so putting this inline in another setup
// file would run too late to affect react-dom's own feature detection).
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId = 1;
  }
  // @ts-expect-error test-only polyfill, not a spec-complete PointerEvent
  globalThis.PointerEvent = PointerEventPolyfill;
}

// The BullMQ Queue instance is a concrete class, but a Symbol keeps this
// consistent with every other provider token in this module (MOCKUP_PROVIDER,
// STORAGE_PROVIDER) and makes it trivial to swap for a fake in tests.
export const MOCKUP_QUEUE = Symbol('MOCKUP_QUEUE');

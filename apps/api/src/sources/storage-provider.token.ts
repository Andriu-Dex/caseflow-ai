// StorageProvider is an interface; Nest DI needs a Symbol token (mirrors
// DIAGRAM_PROVIDER in data-models/diagram-provider.token.ts).
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

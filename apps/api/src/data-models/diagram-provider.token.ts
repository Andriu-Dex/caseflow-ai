// DiagramProvider is an interface (no concrete class token to inject), so a
// dedicated Symbol is required for Nest DI — mirrors AI_PROVIDER in
// ai.module.ts. Kept in its own file so both the module (which provides it)
// and the service (which injects it) can import it without a cycle.
export const DIAGRAM_PROVIDER = Symbol('DIAGRAM_PROVIDER');

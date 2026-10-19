import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';

// A controller only receives the request, hands it to its services and returns
// what they answer: authorization lives in the guards and the rules in the
// services. This calls every route of every controller with stand-ins for its
// services and checks that each one reaches a service (or refuses with an HTTP
// error, as the internal routes do without their secret).

// Any argument: a string when read as text, otherwise an object whose every
// property and call yields the same stand-in, so no route breaks on its shape.
const universal: unknown = new Proxy(function () {}, {
  get: (_target, property) => {
    if (property === Symbol.toPrimitive) return () => 'x';
    if (property === 'then') return undefined;
    if (property === Symbol.iterator) return function* () {};
    return universal;
  },
  apply: () => universal,
});

function fakeService(calls: string[], name: string) {
  const methods = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') return undefined;
        if (!methods.has(property))
          methods.set(
            property,
            vi.fn(async () => {
              calls.push(`${name}.${String(property)}`);
              return universal;
            }),
          );
        return methods.get(property);
      },
    },
  );
}

// By design they reach no service: the liveness probe, the static catalogue of
// target templates and the abstract base the structured-analysis controllers extend.
const WITHOUT_SERVICES = [
  'HealthController',
  'TargetTemplatesController',
  'BaseStructuredAnalysisController',
];

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

async function loadControllers() {
  const found: (new (...args: unknown[]) => Record<string, unknown>)[] = [];
  for (const file of controllerFiles(resolve(__dirname, '..'))) {
    const module = (await import(file)) as Record<string, unknown>;
    for (const value of Object.values(module))
      if (
        typeof value === 'function' &&
        /Controller$/.test(value.name) &&
        !WITHOUT_SERVICES.includes(value.name) &&
        !found.includes(value as never)
      )
        found.push(value as never);
  }
  return found;
}

describe('controllers', () => {
  it('every route of every controller reaches a service', async () => {
    const controllers = await loadControllers();
    expect(controllers.length).toBeGreaterThan(20);
    const withoutService: string[] = [];
    for (const Controller of controllers) {
      const calls: string[] = [];
      const dependencies = (
        (Reflect.getMetadata('design:paramtypes', Controller) as { name?: string }[]) ?? []
      ).map((type, index) => fakeService(calls, type?.name ?? `dependency${index}`));
      const controller = new Controller(...dependencies);
      const routes = Object.getOwnPropertyNames(Object.getPrototypeOf(controller)).filter(
        // Only routes (they carry the HTTP method), not helpers.
        (key) =>
          typeof controller[key] === 'function' &&
          Reflect.getMetadata('method', controller[key] as object) !== undefined,
      );
      for (const route of routes) {
        const before = calls.length;
        try {
          await (controller[route] as (...args: unknown[]) => unknown)(
            ...Array.from({ length: 8 }, () => universal),
          );
        } catch (error) {
          // A refusal (a missing internal secret, a body that fails its schema) is a valid answer.
          if (error instanceof HttpException || (error as Error)?.name === 'ZodError') continue;
        }
        if (calls.length === before) withoutService.push(`${Controller.name}.${route}`);
      }
    }
    expect(withoutService, 'routes that reach no service').toEqual([]);
    // Importing every controller loads most of the API: slow under a full run.
  }, 60_000);
});

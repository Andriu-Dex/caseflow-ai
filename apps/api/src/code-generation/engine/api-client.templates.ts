import { generateOpenApi } from '../openapi.generator';
import {
  SCOPE,
  dependencies,
  file,
  json,
  type GeneratedProjectFile,
  type GenerationContext,
} from './types';

type Schema = {
  $ref?: string;
  type?: string;
  enum?: string[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  nullable?: boolean;
  additionalProperties?: boolean | Schema;
};
type Operation = {
  operationId: string;
  summary?: string;
  parameters?: { name: string; in: string }[];
  requestBody?: { content: { 'application/json': { schema: Schema } } };
  responses: Record<string, { content?: { 'application/json': { schema: Schema } } }>;
};

// DEC-099: the typed client derives from the OpenAPI contract, never from a
// second hand-written description of the API.

function tsType(schema: Schema | undefined): string {
  if (!schema) return 'void';
  if (schema.$ref) return schema.$ref.split('/').pop()!;
  let base: string;
  if (schema.enum) base = schema.enum.map((v) => `'${v}'`).join(' | ');
  else if (schema.type === 'array') base = `${tsType(schema.items)}[]`;
  else if (schema.type === 'integer' || schema.type === 'number') base = 'number';
  else if (schema.type === 'boolean') base = 'boolean';
  else if (schema.type === 'string') base = 'string';
  else if (schema.type === 'object' && !schema.properties) base = 'Record<string, unknown>';
  else base = 'unknown';
  return schema.nullable ? `${base} | null` : base;
}

function interfaceFor(name: string, schema: Schema): string {
  const required = new Set(schema.required ?? []);
  const props = Object.entries(schema.properties ?? {}).map(
    ([key, value]) => `  ${key}${required.has(key) ? '' : '?'}: ${tsType(value)};`,
  );
  return `export interface ${name} {\n${props.join('\n')}\n}`;
}

export function apiClientFiles(ctx: GenerationContext): GeneratedProjectFile[] {
  const doc = generateOpenApi(ctx.plan, ctx.projectName) as {
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, Schema> };
  };
  const types = Object.entries(doc.components.schemas).map(([name, schema]) =>
    interfaceFor(name, schema),
  );
  const operations = Object.entries(doc.paths)
    .flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => ({ path, method, op })),
    )
    .sort((a, b) => a.op.operationId.localeCompare(b.op.operationId));

  const methods = operations.map(({ path, method, op }) => {
    const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name);
    const body = op.requestBody?.content['application/json'].schema;
    const success = Object.entries(op.responses).find(([status]) => status.startsWith('2'));
    const response = success?.[1].content?.['application/json'].schema;
    const args = [
      ...(pathParams.length === 1 && pathParams[0] === 'id' ? ['id: string'] : []),
      ...(pathParams.length && !(pathParams.length === 1 && pathParams[0] === 'id')
        ? [`params: { ${pathParams.map((p) => `${p}: string`).join('; ')} }`]
        : []),
      ...(body ? [`body: ${tsType(body)}`] : []),
    ];
    const url = path.replace(/\{([a-zA-Z0-9]+)\}/g, (_, name: string) =>
      name === 'id' && pathParams.length === 1
        ? '${encodeURIComponent(id)}'
        : `\${encodeURIComponent(params.${name})}`,
    );
    return `    /** ${op.summary ?? op.operationId} */
    ${op.operationId}: (${args.join(', ')}) =>
      request<${tsType(response)}>('${method.toUpperCase()}', \`${url}\`${body ? ', body' : ''}),`;
  });

  const sample = operations.find(({ method, op }) => method === 'get' && !op.parameters?.length);
  const planElements = ctx.plan.entities.map((e) => `entity:${e.localId}`);

  return [
    file(
      'packages/api-client/package.json',
      json({
        name: `${SCOPE}/api-client`,
        version: '0.1.0',
        private: true,
        main: './dist/index.js',
        types: './dist/index.d.ts',
        scripts: {
          build: 'tsc -p tsconfig.build.json',
          typecheck: 'tsc --noEmit',
          lint: 'eslint src',
          test: 'vitest run',
        },
        devDependencies: dependencies(ctx.template, ['typescript', 'vitest', '@types/node']),
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'packages/api-client/tsconfig.json',
      json({
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          rootDir: 'src',
          outDir: 'dist',
          declaration: true,
          lib: ['ES2022', 'DOM'],
        },
        include: ['src'],
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'packages/api-client/tsconfig.build.json',
      json({ extends: './tsconfig.json', exclude: ['src/**/*.spec.ts'] }),
      { kind: 'CONFIG' },
    ),
    file('packages/api-client/openapi.json', json(doc), {
      origin: 'DETERMINISTIC',
      kind: 'CONFIG',
      planElements,
    }),
    file(
      'packages/api-client/src/index.ts',
      `// Typed client for the generated API, derived from openapi.json.
// Regenerate from the Implementation Plan instead of editing by hand.

${types.join('\n\n')}

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => string | null | undefined;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetch ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = options.getToken?.();
    if (token) headers.Authorization = \`Bearer \${token}\`;
    const response = await fetchImpl(\`\${options.baseUrl.replace(/\\/$/, '')}\${path}\`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let message = 'No se pudo completar la solicitud.';
      try {
        const payload = (await response.json()) as { message?: unknown };
        if (typeof payload.message === 'string') message = payload.message;
        else if (Array.isArray(payload.message)) message = payload.message.join(' ');
      } catch {
        // Keep the generic message when the body is not JSON.
      }
      throw new ApiError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
${methods.join('\n')}
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
`,
      { origin: 'DETERMINISTIC', planElements },
    ),
    file(
      'packages/api-client/src/index.spec.ts',
      `import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './index';

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('api client', () => {
${
  sample
    ? `  it('calls the API with the bearer token and parses JSON', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => reply(200, []));
    const client = createApiClient({ baseUrl: 'http://api/', getToken: () => 't0k', fetch });
    await expect(client.${sample.op.operationId}()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      'http://api${sample.path}',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer t0k' }),
      }),
    );
  });

  it('turns an error response into an ApiError with the server message', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => reply(403, { message: 'Sin permiso' }));
    const client = createApiClient({ baseUrl: 'http://api', fetch });
    const failure = client.${sample.op.operationId}();
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 403, message: 'Sin permiso' });
  });`
    : `  it('builds a client', () => {
    expect(createApiClient({ baseUrl: 'http://api' })).toBeTypeOf('object');
  });`
}
});
`,
      { origin: 'DETERMINISTIC', kind: 'TEST', planElements },
    ),
  ];
}

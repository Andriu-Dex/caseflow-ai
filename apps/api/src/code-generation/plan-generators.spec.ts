import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  implementationPlanContentSchema,
  type ImplementationPlanContent,
} from '@caseflow-ai/contracts';
import { generatePrismaSchema } from './prisma-schema.generator';
import { generateOpenApi } from './openapi.generator';
import { collectionPath, tableName } from './naming';

const plan = (overrides: Record<string, unknown> = {}): ImplementationPlanContent =>
  implementationPlanContentSchema.parse({
    designBaselineId: '11111111-1111-4111-8111-111111111111',
    authentication: { required: true, roles: ['ADMIN', 'SELLER'] },
    modules: [
      { localId: 'catalog', name: 'Catalog', description: 'Productos y categorías' },
      { localId: 'sales', name: 'Sales', description: 'Pedidos' },
    ],
    entities: [
      {
        localId: 'category',
        name: 'Category',
        moduleLocalId: 'catalog',
        fields: [{ name: 'name', type: 'STRING', unique: true }],
        operations: ['LIST', 'CREATE'],
      },
      {
        localId: 'product',
        name: 'Product',
        moduleLocalId: 'catalog',
        description: 'Artículo a la venta',
        fields: [
          { name: 'name', type: 'STRING' },
          { name: 'unitPrice', type: 'DECIMAL' },
          { name: 'notes', type: 'TEXT', required: false },
        ],
        relations: [
          {
            name: 'category',
            kind: 'MANY_TO_ONE',
            targetEntityLocalId: 'category',
            required: true,
          },
        ],
        operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
        writeRoles: ['ADMIN'],
      },
      {
        localId: 'order',
        name: 'Order',
        moduleLocalId: 'sales',
        fields: [
          { name: 'status', type: 'ENUM', enumValues: ['DRAFT', 'CONFIRMED'] },
          { name: 'orderedOn', type: 'DATE' },
        ],
        relations: [{ name: 'products', kind: 'MANY_TO_MANY', targetEntityLocalId: 'product' }],
        operations: ['LIST', 'GET'],
      },
    ],
    customEndpoints: [
      {
        moduleLocalId: 'sales',
        method: 'POST',
        path: '/orders/:orderId/confirm',
        summary: 'Confirmar pedido',
        entityLocalId: 'order',
        roles: ['SELLER'],
      },
    ],
    ...overrides,
  });

function prismaValidate(schema: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'caseflow-prisma-'));
  try {
    const file = join(dir, 'schema.prisma');
    writeFileSync(file, schema);
    const cli = require.resolve('prisma/build/index.js', {
      paths: [resolve(__dirname, '../../../..')],
    });
    // Node runs the CLI directly (no shell, so paths with spaces stay intact),
    // outside the repo so CASEFlow's own prisma.config.ts is not picked up.
    try {
      return execFileSync(process.execPath, [cli, 'validate', '--schema', file], {
        cwd: tmpdir(),
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: undefined },
      });
    } catch (error) {
      const { stdout, stderr } = error as { stdout?: string; stderr?: string };
      throw new Error(`prisma validate failed:\n${stdout ?? ''}\n${stderr ?? ''}`, {
        cause: error,
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

describe('naming conventions', () => {
  it('derives table names and REST paths deterministically', () => {
    expect(tableName('OrderItem')).toBe('order_items');
    expect(tableName('Category')).toBe('categories');
    expect(tableName('Address')).toBe('addresses');
    expect(collectionPath('OrderItem')).toBe('/order-items');
  });
});

describe('generatePrismaSchema', () => {
  const schema = generatePrismaSchema(plan());

  it('produces a schema the real Prisma engine validates', () => {
    const output = prismaValidate(schema);
    expect(output).toMatch(/is valid/i);
  }, 60_000);

  it('adds ids, timestamps, FK relations with inverses, enums and snake_case names', () => {
    expect(schema).toContain('model Product {');
    expect(schema).toMatch(/id\s+String\s+@id @default\(uuid\(\)\) @db\.Uuid/);
    expect(schema).toMatch(/unitPrice\s+Decimal\s+@map\("unit_price"\) @db\.Decimal\(12, 2\)/);
    expect(schema).toMatch(/categoryId\s+String\s+@map\("category_id"\) @db\.Uuid/);
    expect(schema).toMatch(/products\s+Product\[\]\s+@relation\("Product_category"\)/);
    expect(schema).toContain('enum OrderStatus {');
    expect(schema).toMatch(/orders\s+Order\[\]\s+@relation\("Order_products"\)/);
    expect(schema).toContain('@@map("order_statuses")'.replace('order_statuses', 'order_status'));
    expect(schema).toContain('@@map("categories")');
  });

  it('is deterministic', () => {
    expect(generatePrismaSchema(plan())).toBe(schema);
  });

  it('fails clearly instead of emitting a broken schema when an inverse name collides', () => {
    const broken = plan({
      entities: [
        {
          localId: 'customer',
          name: 'Customer',
          moduleLocalId: 'sales',
          fields: [{ name: 'orders', type: 'INT' }],
        },
        {
          localId: 'order',
          name: 'Order',
          moduleLocalId: 'sales',
          fields: [{ name: 'total', type: 'DECIMAL' }],
          relations: [{ name: 'customer', kind: 'MANY_TO_ONE', targetEntityLocalId: 'customer' }],
        },
      ],
      customEndpoints: [],
    });
    expect(() => generatePrismaSchema(broken)).toThrow('Customer tendría dos campos');
  });
});

describe('generateOpenApi', () => {
  const doc = generateOpenApi(plan(), 'Tienda') as {
    paths: Record<string, Record<string, { operationId: string; security?: unknown }>>;
    components: { schemas: Record<string, { required?: string[] }> };
  };

  it('exposes exactly the planned CRUD operations and custom endpoints', () => {
    const operations = Object.values(doc.paths).flatMap((p) =>
      Object.values(p).map((o) => o.operationId),
    );
    expect(operations.sort()).toEqual(
      [
        'listCategories',
        'createCategory',
        'listProducts',
        'createProduct',
        'getProduct',
        'updateProduct',
        'deleteProduct',
        'listOrders',
        'getOrder',
        'postOrdersConfirm',
      ].sort(),
    );
    expect(doc.paths['/orders/{orderId}/confirm']?.post).toBeDefined();
    expect(doc.paths['/products']?.get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('describes entities with FK ids and required fields, and resolves every $ref', () => {
    expect(doc.components.schemas.CreateProductInput?.required).toEqual([
      'name',
      'unitPrice',
      'categoryId',
    ]);
    const refs = [...JSON.stringify(doc).matchAll(/#\/components\/schemas\/(\w+)/g)].map(
      (m) => m[1]!,
    );
    for (const name of refs) expect(doc.components.schemas[name]).toBeDefined();
  });

  it('rejects a custom endpoint that collides with a CRUD route', () => {
    const clash = plan({
      customEndpoints: [
        { moduleLocalId: 'catalog', method: 'GET', path: '/products', summary: 'Duplicado' },
      ],
    });
    expect(() => generateOpenApi(clash, 'Tienda')).toThrow('choca');
  });
});

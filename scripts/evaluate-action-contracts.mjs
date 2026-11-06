// Deterministic evaluation of generated action contracts. All generated code runs in Docker.
// Build the API first: pnpm --filter @caseflow-ai/api run build
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require = createRequire(import.meta.url);
const { generateProject } = require('../apps/api/dist/code-generation/engine/project-generator.js');
const {
  actionContractPlan,
  actionContractImplementations,
} = require('../apps/api/dist/code-generation/testing/action-contract-plan.js');
const { CASEFLOW_WEB_TS_V2 } = require('../packages/domain/dist/index.js');
const {
  DockerSandboxExecutionProvider,
  DockerRuntimeCaptureProvider,
} = require('../packages/integrations/dist/index.js');
const execute = promisify(execFile);
const outputDirectory = join(tmpdir(), 'caseflow-action-contract-evaluation');

const httpScript = String.raw`(async () => {
  const assert = require("node:assert/strict"),
    { randomUUID } = require("node:crypto");
  const { PrismaService } = require("/app/apps/api/dist/prisma/prisma.service");
  const p = new PrismaService();
  const checks = [];
  const ok = (value, name) => {
    assert.ok(value, name);
    checks.push(name);
  };
  const api = async (path, method = "GET", body) => {
    const r = await fetch("http://127.0.0.1:3001" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    for (let i = 0; i < 200; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3001/health")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const product = await p.product.create({
      data: { name: "Producto de prueba", unitPrice: "0.10", active: true },
    });
    const request = { lines: [{ productId: product.id, quantity: 3 }] };
    let r = await api("/orders/drafts", "POST", { ...request, total: "0" });
    ok(r.status === 400, "Unknown monetary input rejected");
    r = await api("/orders/drafts", "POST", {
      lines: [{ productId: "bad-id", quantity: 1 }],
    });
    ok(r.status === 400, "UUID contract enforced");
    r = await api("/orders/drafts", "POST", {
      lines: [{ productId: product.id, quantity: 0 }],
    });
    ok(r.status === 400, "Positive quantity enforced");
    r = await api("/orders/drafts", "POST", {
      lines: [
        { productId: product.id, quantity: 1 },
        { productId: randomUUID(), quantity: 1 },
      ],
    });
    ok(
      r.status === 400 &&
        (await p.order.count()) === 0 &&
        (await p.orderLine.count()) === 0,
      "Failed create rolls back all records",
    );
    r = await api("/orders/drafts", "POST", request);
    ok(
      r.status === 200 && r.data.total === "0.30",
      "Exact server money and declared HTTP status",
    );
    const id = r.data.id;
    r = await api("/orders/" + id + "/draft", "PATCH", {
      expectedRevision: 0,
      lines: [{ productId: product.id, quantity: 4 }],
    });
    ok(
      r.status === 200 && r.data.total === "0.40" && r.data.revision === 1,
      "Draft update recalculates exact total",
    );
    r = await api("/orders/" + id + "/draft", "PATCH", {
      expectedRevision: 0,
      lines: [{ productId: product.id, quantity: 1 }],
    });
    ok(r.status === 409, "Stale draft revision rejected");
    r = await api("/orders/" + id + "/draft", "PATCH", {
      expectedRevision: 1,
      lines: [{ productId: randomUUID(), quantity: 1 }],
    });
    const current = await p.order.findUnique({ where: { id } });
    ok(
      r.status === 400 &&
        current.revision === 1 &&
        current.total.toFixed(2) === "0.40" &&
        (await p.orderLine.count({ where: { orderId: id } })) === 1,
      "Failed update rolls back revision and details",
    );
    r = await api("/orders/" + id + "/review?includeLines=true&limit=50");
    ok(
      r.status === 200 && r.data.lines.length === 1,
      "Typed query true parsed",
    );
    r = await api("/orders/" + id + "/review?includeLines=false&limit=50");
    ok(
      r.status === 200 && r.data.lines.length === 0,
      "Typed query false parsed",
    );
    r = await api("/orders/" + id + "/review?includeLines=0&limit=50");
    ok(r.status === 400, "Nonboolean query rejected");
    r = await api("/orders/" + id + "/review?includeLines=true&limit=0");
    ok(r.status === 400, "Query numeric bounds enforced");
    r = await api(
      "/orders/" + id + "/review?includeLines=true&limit=50&unknown=x",
    );
    ok(r.status === 400, "Unknown query rejected");
    const confirm = { idempotencyKey: randomUUID(), expectedRevision: 1 };
    const both = await Promise.all([
      api("/orders/" + id + "/confirm", "POST", confirm),
      api("/orders/" + id + "/confirm", "POST", confirm),
    ]);
    ok(
      both.every(
        (r) =>
          r.status === 200 &&
          r.data.status === "CONFIRMED" &&
          r.data.total === "0.40",
      ) &&
        (await p.confirmationReceipt.count({ where: { orderId: id } })) === 1,
      "Concurrent confirmation produces one effect and recovers result",
    );
    r = await api("/orders/" + id + "/confirm", "POST", confirm);
    ok(
      r.status === 200 && r.data.revision === 2,
      "Same-key retry recovers original revision",
    );
    r = await api("/orders/" + id + "/confirm", "POST", {
      ...confirm,
      expectedRevision: 0,
    });
    ok(r.status === 409, "Same key with different data rejected");
    r = await api("/orders/" + id + "/confirm", "POST", {
      ...confirm,
      idempotencyKey: randomUUID(),
    });
    ok(r.status === 409, "Second distinct confirmation rejected");
    r = await api("/orders/" + id + "/draft", "PATCH", {
      expectedRevision: 2,
      lines: [{ productId: product.id, quantity: 2 }],
    });
    ok(r.status === 409, "Confirmed lines immutable");
    await p.product.update({
      where: { id: product.id },
      data: { unitPrice: "99.99" },
    });
    r = await api("/orders/" + id + "/review?includeLines=true&limit=50");
    ok(
      r.data.total === "0.40" && r.data.lines[0].unitPrice === "0.10",
      "Catalog updates preserve historical money",
    );
    r = await api("/orders/invalid-response");
    ok(
      r.status === 500 && !JSON.stringify(r.data).includes("must-not-leak"),
      "Invalid output contract fails safely",
    );
    const browserProduct = await p.product.create({
      data: { name: "Producto navegador", unitPrice: "0.10", active: true },
    });
    console.log(
      JSON.stringify({
        checks,
        productId: product.id,
        browserProductId: browserProduct.id,
      }),
    );
  } finally {
    await p.$disconnect();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
`;
const browserScript = String.raw`async function verifyActionUI() {
  const { chromium } = require("/opt/capture/node_modules/playwright");
  const assert = require("node:assert/strict");
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (let i = 0; i < 50; i++) {
      try {
        if (
          (
            await page.goto("http://application:3000/orders/new", {
              timeout: 2000,
            })
          ).ok()
        )
          break;
      } catch {}
      await page.waitForTimeout(500);
    }
    const section = (label) =>
      page
        .locator("section")
        .filter({
          has: page.getByRole("heading", {
            level: 2,
            name: label,
            exact: true,
          }),
        });
    const create = section("Crear borrador");
    await create
      .getByRole("button", { name: "Agregar elemento", exact: true })
      .click();
    await create
      .getByLabel("Producto", { exact: true })
      .selectOption(BROWSER_PRODUCT);
    await create.getByLabel("Cantidad", { exact: true }).fill("3");
    await create
      .getByRole("button", { name: "Crear borrador", exact: true })
      .click();
    await page.waitForURL(/\/orders\/[0-9a-f-]+$/);
    const save = section("Guardar borrador"),
      review = section("Revisar operación"),
      confirm = section("Confirmar operación");
    assert.equal(
      await confirm
        .getByRole("button", { name: "Confirmar operación", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page.getByLabel("Versión revisada", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByLabel("Clave de confirmación", { exact: true }).count(),
      0,
    );
    await review.getByLabel("includeLines", { exact: true }).check();
    await review.getByLabel("limit", { exact: true }).fill("50");
    await review
      .getByRole("button", { name: "Revisar operación", exact: true })
      .click();
    await review.getByRole("status").filter({ hasText: "DRAFT" }).waitFor();
    await confirm
      .getByRole("button", { name: "Confirmar operación", exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-action="Confirmar operación"]').disabled,
    );
    await save
      .getByRole("button", { name: "Agregar elemento", exact: true })
      .click();
    await save
      .getByLabel("Producto", { exact: true })
      .selectOption(BROWSER_PRODUCT);
    await save.getByLabel("Cantidad", { exact: true }).fill("5");
    await confirm
      .getByText("Guarde los cambios pendientes antes de continuar.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await confirm
        .getByRole("button", { name: "Confirmar operación", exact: true })
        .isDisabled(),
      true,
    );
    await save
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await save.getByRole("status").filter({ hasText: "0.50" }).waitFor();
    assert.equal(
      await confirm
        .getByRole("button", { name: "Confirmar operación", exact: true })
        .isDisabled(),
      true,
    );
    await review
      .getByRole("button", { name: "Revisar operación", exact: true })
      .click();
    await review.getByRole("status").filter({ hasText: "0.50" }).waitFor();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-action="Confirmar operación"]').disabled,
    );
    await confirm
      .getByRole("button", { name: "Confirmar operación", exact: true })
      .click();
    await confirm
      .getByRole("status")
      .filter({ hasText: "CONFIRMED" })
      .waitFor();
    await review
      .getByRole("button", { name: "Revisar operación", exact: true })
      .click();
    await confirm
      .getByText("La operación ya no admite esta acción.", { exact: true })
      .waitFor();
    assert.equal(
      await confirm
        .getByRole("button", { name: "Confirmar operación", exact: true })
        .isDisabled(),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: typed action browser creation, navigation, hidden bindings, review, dirty-state lock, save, confirmation and final-state lock",
    );
  } catch (e) {
    throw e;
  } finally {
    await browser.close();
  }
}
`;

async function main() {
  mkdirSync(outputDirectory, { recursive: true });
  const files = generateProject(
    {
      plan: actionContractPlan(),
      template: CASEFLOW_WEB_TS_V2,
      projectName: 'Pedidos de prueba',
      slug: 'orders-test',
    },
    actionContractImplementations,
  );
  const validation = await new DockerSandboxExecutionProvider().execute({
    files,
    commands: CASEFLOW_WEB_TS_V2.validationCommands.map((command) => ({
      ...command,
      network: command.stage === 'INSTALL',
    })),
    allowedCommands: CASEFLOW_WEB_TS_V2.validationCommands.map((command) => command.argv),
    toolchain: {
      nodeMajor: 24,
      packageManager: CASEFLOW_WEB_TS_V2.toolchain.packageManager,
    },
    limits: { timeoutMs: 600000, memoryMb: 4096, cpus: 2, pids: 512 },
    collect: ['pnpm-lock.yaml'],
    onStageStart: (stage) => console.log('STAGE', stage),
  });
  writeFileSync(join(outputDirectory, 'validation.json'), JSON.stringify(validation, null, 2));
  if (validation.stages.some((stage) => stage.exitCode !== 0 || stage.timedOut)) {
    console.error('Generated validation failed. See', join(outputDirectory, 'validation.json'));
    process.exitCode = 1;
    return;
  }
  files.push({
    path: 'pnpm-lock.yaml',
    content: validation.collected['pnpm-lock.yaml'],
  });
  let tested = false,
    proof,
    browserPassed = false,
    failure;
  const runner = async (args, timeout, signal) => {
    if (
      args[0] === 'cp' &&
      args[1].endsWith('/.') &&
      args[2].includes('-browser:/tmp/controller')
    ) {
      if (!proof?.browserProductId) throw Error('HTTP fixture proof missing');
      const file = join(args[1].slice(0, -2), 'browser.cjs');
      const source = readFileSync(file, 'utf8').replace(
        "  await mkdir('/tmp/capture-output'",
        "  await verifyActionUI();\n  await mkdir('/tmp/capture-output'",
      );
      writeFileSync(
        file,
        source +
          '\n' +
          browserScript.replaceAll('BROWSER_PRODUCT', JSON.stringify(proof.browserProductId)),
      );
    }
    const result = await execute('docker', args, {
      timeout,
      signal,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    if (!tested && args[0] === 'run' && args.at(-1)?.includes('node apps/api/dist/main.js')) {
      tested = true;
      try {
        const check = await execute(
          'docker',
          ['exec', args[args.indexOf('--name') + 1], 'node', '-e', httpScript],
          { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 },
        );
        proof = JSON.parse(check.stdout.trim());
        console.log('HTTP_CHECKS', proof.checks.length);
      } catch (error) {
        failure = error.stderr || error.message;
        console.error(failure);
      }
    }
    if (result.stdout.includes('PASS: typed action browser')) {
      browserPassed = true;
      console.log('BROWSER_FLOW_PASS');
    }
    return result.stdout;
  };
  const captures = await new DockerRuntimeCaptureProvider(runner).capture({
    files,
    targets: [{ role: '', routePath: '/orders/new' }],
  });
  for (const [index, capture] of captures.entries())
    if (capture.png) writeFileSync(join(outputDirectory, 'capture-' + index + '.png'), capture.png);
  const result = {
    proof,
    browserPassed,
    failure,
    captures: captures.map(({ png, ...capture }) => {
      void png;
      return capture;
    }),
  };
  writeFileSync(join(outputDirectory, 'runtime.json'), JSON.stringify(result, null, 2));
  console.log('EVIDENCE', outputDirectory);
  if (
    failure ||
    !proof ||
    !browserPassed ||
    captures.some((capture) => capture.status !== 'CAPTURED')
  )
    process.exitCode = 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

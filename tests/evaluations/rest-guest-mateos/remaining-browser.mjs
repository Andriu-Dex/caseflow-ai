import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const load = createRequire(import.meta.url);
export async function verifyRemainingUI(targets, proof) {
  if (process.env.CASEFLOW_EVALUATION_DISPOSABLE !== '1')
    throw new Error('Run browser evaluation only inside a disposable Docker controller.');
  const { chromium } = load('/opt/capture/node_modules/playwright');
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(
      (token) => globalThis.sessionStorage.setItem('access-token', token),
      targets.find((t) => t.role === 'Administrador').token,
    );
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://application:3000/home');
    await page.locator('#operation-scope').selectOption(proof.scopeA);
    await page.waitForFunction(
      (id) => globalThis.sessionStorage.getItem('operation-scope') === id,
      proof.scopeA,
    );
    const section = (name) =>
      page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
    await page.goto('http://application:3000/dashboard');
    const indicators = section('Consultar indicadores para la selección');
    const refresh = section('Actualizar la consulta');
    const fromLabel = 'Desde, fecha operativa inclusiva';
    const toLabel = 'Hasta, fecha operativa inclusiva';
    await indicators.getByLabel(fromLabel, { exact: true }).fill(today);
    await indicators.getByLabel(toLabel, { exact: true }).fill(today);
    await page.waitForFunction(
      (date) =>
        [...globalThis.document.querySelectorAll('input[type="date"]')].every(
          (input) => input.value === date,
        ),
      today,
    );
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/management/indicators?') && response.request().method() === 'GET',
    );
    await refresh.getByRole('button', { name: 'Actualizar la consulta', exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const result = await response.json();
    assert.equal(result.from, today);
    assert.equal(result.to, today);
    assert.equal(result.branchId, proof.scopeA);
    assert.equal(
      await refresh.locator('[data-collection-layout="CARDS"] article').count(),
      result.metrics.length,
    );
    const tables = refresh.locator('[data-collection-layout="TABLE"]');
    assert.equal(
      await tables.locator('table').count(),
      new Set(result.breakdowns.map((item) => item.category)).size,
    );
    assert.equal(await tables.locator('tbody tr').count(), result.breakdowns.length);
    console.log(
      'PASS: remaining browser renders real metrics as cards and complete breakdowns as grouped tables',
    );
    const timestamp = refresh.locator('time[datetime]').first();
    await timestamp.waitFor();
    assert.equal(await timestamp.getAttribute('datetime'), result.generatedAt);
    assert.equal(await timestamp.getAttribute('title'), result.generatedAt);
    assert.equal(
      await timestamp.innerText(),
      new Intl.DateTimeFormat('es', {
        timeZone: result.timeZone,
        dateStyle: 'medium',
        timeStyle: 'short',
        hourCycle: 'h23',
      }).format(new Date(result.generatedAt)) +
        ' · ' +
        result.timeZone,
    );
    console.log(
      'PASS: remaining browser shows branch-local timestamps while preserving canonical UTC',
    );
    let releaseResponse;
    let requestStarted;
    const started = new Promise((resolve) => {
      requestStarted = resolve;
    });
    const released = new Promise((resolve) => {
      releaseResponse = resolve;
    });
    const indicatorPattern = /\/management\/indicators\?/;
    await page.route(indicatorPattern, async (route) => {
      const response = await route.fetch();
      requestStarted();
      await released;
      await route.fulfill({ response });
    });
    await refresh.getByRole('button', { name: 'Actualizar la consulta', exact: true }).click();
    await started;
    await indicators.getByLabel(fromLabel, { exact: true }).fill('2000-01-01');
    releaseResponse();
    await refresh.getByRole('button', { name: 'Actualizar la consulta', exact: true }).waitFor();
    assert.equal(await indicators.getByRole('status').count(), 0);
    assert.equal(await refresh.getByRole('status').count(), 0);
    await page.unroute(indicatorPattern);
    console.log('PASS: remaining browser discards late results after shared filters change');
    await page.goto('http://application:3000/home');
    await page.locator('#operation-scope').selectOption(proof.scopeB);
    await page.waitForFunction(
      (id) => globalThis.sessionStorage.getItem('operation-scope') === id,
      proof.scopeB,
    );
    await page.goto('http://application:3000/dashboard');
    await page.waitForFunction(() =>
      [...globalThis.document.querySelectorAll('input[type="date"]')].every(
        (input) => input.value === '',
      ),
    );
    await page.goto('http://application:3000/home');
    await page.locator('#operation-scope').selectOption(proof.scopeA);
    await page.waitForFunction(
      (id) => globalThis.sessionStorage.getItem('operation-scope') === id,
      proof.scopeA,
    );
    console.log(
      'PASS: remaining browser shared dashboard filters, refresh selection and branch isolation',
    );
    await page.goto('http://application:3000/dashboard/recommendations');
    const advisory = section(
      'Consultar recomendaciones para la sucursal y el periodo seleccionados',
    );
    assert.match(
      await advisory.getByRole('note').innerText(),
      /No ejecutan cambios operativos ni demuestran relaciones causales/,
    );
    assert.equal(await advisory.getByRole('status').count(), 0);
    console.log(
      'PASS: remaining browser explains advisory limits before requesting any recommendations',
    );
    await page.goto('http://application:3000/reports/sales');
    const report = section('Consultar reporte en pantalla');
    assert.equal(await report.getByLabel(fromLabel, { exact: true }).inputValue(), '');
    await report.getByLabel('Desde, fecha operativa inclusiva', { exact: true }).fill(today);
    await report.getByLabel('Hasta, fecha operativa inclusiva', { exact: true }).fill(today);
    await report
      .getByRole('button', { name: 'Consultar reporte en pantalla', exact: true })
      .click();
    const csvButton = report.getByRole('button', { name: /^Descargar ventas-/ });
    await csvButton.waitFor();
    const csvPromise = page.waitForEvent('download');
    await csvButton.click();
    const csv = await csvPromise;
    const csvText = await readFile(await csv.path(), 'utf8');
    assert.ok(csvText.includes(proof.scopeA));
    assert.ok(csvText.includes('0.02'));
    assert.ok(csv.suggestedFilename().endsWith('.csv'));
    console.log('PASS: remaining browser report filters, structured results and CSV download');
    await page.goto('http://application:3000/expenses/' + proof.expenseId + '/receipts');
    const attachments = section('Adjuntar comprobante'),
      pdf = Buffer.from('%PDF-1.4\nBrowser fixture\n%%EOF');
    await attachments
      .getByLabel('Imagen o PDF del comprobante', { exact: true })
      .setInputFiles({ name: 'browser.pdf', mimeType: 'application/pdf', buffer: pdf });
    await attachments.getByText('Leyendo archivo…', { exact: true }).waitFor({ state: 'hidden' });
    await attachments.getByRole('button', { name: 'Adjuntar comprobante', exact: true }).click();
    const pdfButton = attachments.getByRole('button', {
      name: 'Descargar browser.pdf',
      exact: true,
    });
    await pdfButton.waitFor();
    const pdfPromise = page.waitForEvent('download');
    await pdfButton.click();
    const downloaded = await pdfPromise;
    assert.deepEqual(await readFile(await downloaded.path()), pdf);
    console.log(
      'PASS: remaining browser private file selection, attachment and exact PDF download',
    );
    await page.goto('http://application:3000/catering/records/' + proof.requestId + '/transition');
    await page.getByLabel('Tipo de registro', { exact: true }).selectOption('REQUEST');
    await page.getByLabel('Operación', { exact: true }).selectOption('CANCEL');
    await page.getByLabel('Revisión esperada', { exact: true }).fill(String(proof.requestRevision));
    await page.getByLabel('Motivo', { exact: true }).fill('Cancelación desde navegador');
    await page
      .getByRole('button', { name: /Solicitar confirmación, inicio de preparación/ })
      .click();
    await page.getByRole('status').filter({ hasText: 'CANCELLED' }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: remaining browser authorized catering transition');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://application:3000/expenses/' + proof.expenseId + '/receipts');
    const mobile = section('Adjuntar comprobante');
    assert.ok(await mobile.getByLabel('Imagen o PDF del comprobante', { exact: true }).isVisible());
    await mobile
      .getByLabel('Imagen o PDF del comprobante', { exact: true })
      .setInputFiles({ name: 'mobile.pdf', mimeType: 'application/pdf', buffer: pdf });
    await mobile.getByText('Leyendo archivo…', { exact: true }).waitFor({ state: 'hidden' });
    await mobile.getByRole('button', { name: 'Adjuntar comprobante', exact: true }).click();
    const mobileDownload = mobile.getByRole('button', {
      name: 'Descargar mobile.pdf',
      exact: true,
    });
    await mobileDownload.waitFor();
    const mobilePromise = page.waitForEvent('download');
    await mobileDownload.click();
    const mobileFile = await mobilePromise;
    assert.deepEqual(await readFile(await mobileFile.path()), pdf);
    assert.deepEqual(errors, []);
    console.log('PASS: remaining browser mobile private attachment and exact download');

    // --- List Generator Browser Verification (/products) ---
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://application:3000/products');
    const table = page.locator('table');
    await table.waitFor();

    // 1. Visible Identificador column
    const idHeader = table.locator('th').filter({ hasText: 'Identificador' });
    assert.ok((await idHeader.count()) > 0, 'Table has visible Identificador header');

    // 2. No unapproved implicit "Nuevo" button in read-only query view
    assert.equal(
      await page.getByRole('button', { name: 'Nuevo', exact: true }).count(),
      0,
      'Read-only list view does not inject unapproved Nuevo button',
    );

    // 3. Row displays identifier in first cell
    const firstRow = table.locator('tbody tr').first();
    const idCell = firstRow.locator('td').first();
    assert.ok((await idCell.innerText()).length > 0, 'Row displays identifier in first cell');

    // 4. Pagination controls
    const prevAction = page.locator('[data-action="Ir a la página anterior"]');
    const nextAction = page.locator('[data-action="Ir a la página siguiente"]');
    assert.equal(await prevAction.count(), 1, 'Previous action button must exist');
    assert.equal(await nextAction.count(), 1, 'Next action button must exist');
    assert.ok(await prevAction.isDisabled(), 'Ir a la página anterior is disabled on page 1');

    if (await nextAction.isEnabled()) {
      const nextPromise = page.waitForResponse(
        (response) => response.url().includes('/products?') && response.url().includes('page=2'),
      );
      await nextAction.click();
      await nextPromise;
      assert.ok(await prevAction.isEnabled(), 'Ir a la página anterior is enabled on page 2');
    }

    // 5. Query / Refetch action and error recovery
    const queryAction = page.locator('[data-action="Consultar productos"]');
    assert.equal(await queryAction.count(), 1, 'Consultar productos button must exist');

    const refetchPromise = page.waitForResponse(
      (response) => response.url().includes('/products?') && response.request().method() === 'GET',
    );
    await queryAction.click();
    const refetchResponse = await refetchPromise;
    assert.equal(refetchResponse.status(), 200, 'Consultar productos triggers real request');

    // 6. Real error recovery: intercept with failure, assert alert role, unroute, refetch and assert recovery
    await page.route('**/products*', (route) =>
      route.fulfill({ status: 500, body: 'Simulated backend failure' }),
    );
    await queryAction.click();
    const alert = page.locator('[role="alert"]');
    await alert.waitFor({ timeout: 5000 });
    assert.ok((await alert.count()) > 0, 'Page displays alert role upon real request error');

    await page.unroute('**/products*');
    const recoverPromise = page.waitForResponse(
      (response) => response.url().includes('/products?') && response.request().method() === 'GET',
    );
    await queryAction.click();
    const recoverResponse = await recoverPromise;
    assert.equal(recoverResponse.status(), 200, 'Refetch recovers from error with HTTP 200');
    await table.waitFor();

    assert.deepEqual(errors, []);
    console.log('PASS: remaining browser list table, identifier, pagination and query actions');
    await context.close();
  } finally {
    await browser.close();
  }
}

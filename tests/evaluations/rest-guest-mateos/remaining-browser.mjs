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
    await page.goto('http://application:3000/reports/sales');
    const report = section('Consultar reporte en pantalla'),
      today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
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
    await context.close();
  } finally {
    await browser.close();
  }
}

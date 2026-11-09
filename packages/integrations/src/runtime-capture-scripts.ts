// This script executes only in the dedicated Playwright container.
export const CAPTURE_BROWSER_SCRIPT = String.raw`
const { chromium } = require('/opt/capture/node_modules/playwright');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
setTimeout(() => process.exit(1), Number(process.env.CASEFLOW_BROWSER_TIMEOUT_MS ?? 180000)).unref();
(async () => {
  const targets = JSON.parse(await readFile('/tmp/controller/plan.json', 'utf8'));
  await mkdir('/tmp/capture-output', { recursive: true });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      let status = 'FAILED';
      let reasonCode = null;
      if (target.routePath.includes('[')) {
        await writeFile('/tmp/capture-output/' + index + '.json', JSON.stringify({ status: 'SKIPPED' }));
        continue;
      }
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const origin = new URL(route.request().url()).origin;
        return ['http://application:3000', 'http://application:3001'].includes(origin) ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      try {
        let ready = false;
        for (let attempt = 0; attempt < 50; attempt++) {
          try {
            const response = await page.goto('http://application:3000', { waitUntil: 'domcontentloaded', timeout: 2000 });
            if (response && response.ok()) { ready = true; break; }
          } catch {}
          await page.waitForTimeout(1000);
        }
        if (!ready) throw new Error('APPLICATION_UNAVAILABLE');
        if (target.token) await context.addInitScript(value => { window.sessionStorage.setItem('access-token', value.token); if (value.scopeId) window.sessionStorage.setItem('operation-scope', value.scopeId); }, {token: target.token, scopeId: target.scopeId});
        let failure = null;
        page.on('pageerror', () => { failure = 'BROWSER_ERROR'; });
        page.on('response', response => {
          if (response.status() >= 400 && response.url().startsWith('http://application:3001/'))
            failure = response.status() === 403 ? 'API_FORBIDDEN' : response.status() === 401 ? 'API_UNAUTHORIZED' : 'API_FAILURE';
        });
        const response = await page.goto('http://application:3000' + target.routePath, { waitUntil: 'networkidle', timeout: 20000 });
        if (!response || !response.ok() || new URL(page.url()).pathname !== target.routePath) throw new Error('WRONG_SCREEN');
        try { await page.locator('h1').first().waitFor({ state: 'visible', timeout: 5000 }); }
        catch { throw new Error('SCREEN_HEADING_MISSING'); }
        await page.evaluate(() => document.fonts.ready);
        if (await page.locator('img').evaluateAll(images => images.some(image => !image.complete || image.naturalWidth === 0))) failure = 'IMAGE_FAILURE';
        if (failure) throw new Error(failure);
        if (await page.getByText(/No autorizado|Acceso denegado|Internal server error/i).count()) throw new Error('API_FAILURE');
        await page.screenshot({ path: '/tmp/capture-output/' + index + '.png', animations: 'disabled', fullPage: false });
        status = 'CAPTURED';
      } catch (error) { reasonCode = error.message; } finally { await context.close(); }
      await writeFile('/tmp/capture-output/' + index + '.json', JSON.stringify({ status, reasonCode }));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error('Capture browser failed:', error.message); process.exitCode = 1; });
`;

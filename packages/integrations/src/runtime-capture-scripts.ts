// This script executes only in the dedicated Playwright container.
export const CAPTURE_BROWSER_SCRIPT = String.raw`
const { chromium } = require('/opt/capture/node_modules/playwright');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
setTimeout(() => process.exit(1), 180000).unref();
(async () => {
  const targets = JSON.parse(await readFile('/tmp/controller/plan.json', 'utf8'));
  await mkdir('/tmp/capture-output', { recursive: true });
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      let status = 'FAILED';
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
        if (!ready) throw new Error('Application unavailable');
        if (target.role) {
          const login = await context.request.post('http://application:3001/auth/dev-login', { data: { role: target.role } });
          if (!login.ok()) throw new Error('Test role unavailable');
          const { token } = await login.json();
          await context.addInitScript(value => window.sessionStorage.setItem('access-token', value), token);
        }
        let broken = false;
        page.on('pageerror', () => { broken = true; });
        page.on('response', response => { if (response.status() >= 400 && response.url().startsWith('http://application:3001/')) broken = true; });
        const response = await page.goto('http://application:3000' + target.routePath, { waitUntil: 'networkidle', timeout: 20000 });
        if (!response || !response.ok() || new URL(page.url()).pathname !== target.routePath) throw new Error('Wrong screen');
        await page.locator('h1').first().waitFor({ state: 'visible', timeout: 5000 });
        await page.evaluate(() => document.fonts.ready);
        if (await page.locator('img').evaluateAll(images => images.some(image => !image.complete || image.naturalWidth === 0))) broken = true;
        if (broken || await page.getByText(/No autorizado|Acceso denegado|Internal server error/i).count()) throw new Error('Screen failed');
        await page.screenshot({ path: '/tmp/capture-output/' + index + '.png', animations: 'disabled', fullPage: false });
        status = 'CAPTURED';
      } catch {} finally { await context.close(); }
      await writeFile('/tmp/capture-output/' + index + '.json', JSON.stringify({ status }));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error('Capture browser failed:', error.message); process.exitCode = 1; });
`;

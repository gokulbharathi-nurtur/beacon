import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3001';
const OUT_DIR = process.argv[3] || '.';
const FIXTURE_URL = process.argv[4] || 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

console.log('1. Navigating to /templates/new');
await page.goto(`${BASE}/templates/new`, { waitUntil: 'networkidle' });

console.log('2. Filling URL and clicking Capture');
await page.fill('#url', FIXTURE_URL);
await page.click('button:has-text("Capture")');

console.log('3. Waiting for review step (polling client-side)...');
await page.waitForSelector('text=Review capture', { timeout: 30000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT_DIR}/e2e-review-step.png`, fullPage: true });
console.log('   Captured review step');

console.log('4. Checking a checkbox toggle works (flip first checkbox)');
const firstCheckbox = page.locator('input[type=checkbox]').first();
const before = await firstCheckbox.isChecked();
await firstCheckbox.click();
const after = await firstCheckbox.isChecked();
console.log(`   checkbox toggled: ${before} -> ${after}`);
await firstCheckbox.click(); // toggle back to keep event exact (safe default)

console.log('5. Filling template name and saving');
await page.fill('#name', `E2E Test Template ${Date.now()}`);
await page.click('button:has-text("Confirm & Save")');

console.log('6. Waiting for redirect to /templates/[id]');
await page.waitForURL(/\/templates\/[^/]+$/, { timeout: 10000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT_DIR}/e2e-saved-template.png`, fullPage: true });
console.log(`   Landed on ${page.url()}`);

console.log('7. Navigating to dashboard, running a diff via the UI form');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.fill('#url', FIXTURE_URL);
// pick the just-created template in the select
await page.selectOption('#template', { label: (await page.locator('#template option').last().textContent()) ?? '' });
await page.click('button:has-text("Run")');

console.log('8. Waiting for run to complete...');
await page.waitForURL(/\/runs\/[^/]+$/, { timeout: 10000 });
await page.waitForSelector('text=Clean', { timeout: 30000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT_DIR}/e2e-diff-result.png`, fullPage: true });
console.log(`   Diff run complete at ${page.url()}`);

await browser.close();
console.log('DONE');

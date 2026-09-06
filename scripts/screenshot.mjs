import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3001';
const OUT_DIR = process.argv[3] || '.';
const PAGES = process.argv[4] ? JSON.parse(process.argv[4]) : [
  { path: '/load-events', name: 'dashboard' },
  { path: '/load-events/templates', name: 'templates-list' },
  { path: '/load-events/templates/new', name: 'templates-new' },
  { path: '/load-events/content-check', name: 'content-check' },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

for (const { path, name } of PAGES) {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: true });
  console.log(`Captured ${name}`);
}

await browser.close();

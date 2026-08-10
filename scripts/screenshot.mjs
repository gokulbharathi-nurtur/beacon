import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3001';
const OUT_DIR = process.argv[3] || '.';
const PAGES = process.argv[4] ? JSON.parse(process.argv[4]) : [
  { path: '/', name: 'dashboard' },
  { path: '/templates', name: 'templates-list' },
  { path: '/templates/new', name: 'templates-new' },
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

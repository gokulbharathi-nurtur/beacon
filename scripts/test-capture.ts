// Standalone capture-engine smoke test — run against a real URL, outside the web app.
// Usage: npx tsx scripts/test-capture.ts <url>
import { chromium } from 'playwright';
import { runCapture } from '../lib/capture/injectCapture';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npx tsx scripts/test-capture.ts <url>');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Capturing ${url} ...`);
  const result = await runCapture(page, url);

  console.log(`\nSettled: ${!result.timedOut} (timedOut=${result.timedOut})`);
  console.log(`Duration: ${new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime()}ms`);
  console.log(`\nEvents captured (${result.events.length}):`);
  for (const [i, ev] of result.events.entries()) {
    console.log(`  [${i}] ${ev.event}`);
  }
  console.log(`\nNon-event pushes filtered (${result.filteredPushCount}):`);
  const nonEvents = result.rawPushes.filter((p) => !result.events.includes(p as (typeof result.events)[number]));
  for (const p of nonEvents) {
    console.log(`  ${JSON.stringify(p)}`);
  }
  console.log('\nFull events JSON:');
  console.log(JSON.stringify(result.events, null, 2));

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

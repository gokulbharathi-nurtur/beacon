import { NextRequest, NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';
import { getQueue } from '@/lib/queue';
import { discover, type FormTarget } from '@/lib/capture/drivers/form';
import { assertValidTargetUrl, InvalidTargetUrlError } from '@/lib/urlGuard';
import { discoverElementsSchema } from '@/lib/validation';

// Mirrors app/api/discover-elements/route.ts's discovery-only timeout — the DOM just
// needs to exist, not for dataLayer to settle, and this ties up a queue slot synchronously.
const DISCOVER_NAV_TIMEOUT_MS = 10_000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = discoverElementsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertValidTargetUrl(parsed.data.url);
  } catch (err) {
    if (err instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  try {
    const forms = (await getQueue().add(() => discoverOnPage(parsed.data.url))) ?? [];
    return NextResponse.json({ forms });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load the page.' }, { status: 502 });
  }
}

async function discoverOnPage(url: string): Promise<FormTarget[]> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DISCOVER_NAV_TIMEOUT_MS });
    return await discover(page);
  } finally {
    await context.close().catch(() => {});
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';
import { getQueue } from '@/lib/queue';
import { discoverClickableElements, type ClickableElement } from '@/lib/capture/discoverClickables';
import { assertValidTargetUrl, InvalidTargetUrlError } from '@/lib/urlGuard';
import { discoverElementsSchema } from '@/lib/validation';

// Shorter than capture's 30s DEFAULT_NAV_TIMEOUT_MS — discovery only needs the DOM to
// exist, not for dataLayer pushes to settle, and this runs synchronously in the request
// (tying up one of the queue's 2 slots), so it should fail fast rather than inherit a
// timeout tuned for a different reason.
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
    const elements = (await getQueue().add(() => discoverOnPage(parsed.data.url))) ?? [];
    return NextResponse.json({ elements });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load the page.' }, { status: 502 });
  }
}

async function discoverOnPage(url: string): Promise<ClickableElement[]> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DISCOVER_NAV_TIMEOUT_MS });
    return await discoverClickableElements(page);
  } finally {
    await context.close().catch(() => {});
  }
}

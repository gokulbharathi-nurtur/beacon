import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getBrowser } from '@/lib/browser';
import { discoverClickables } from '@/lib/capture/discoverClickables';
import { assertValidTargetUrl, InvalidTargetUrlError } from '@/lib/urlGuard';

const schema = z.object({ url: z.string().min(1) });

/**
 * Scans a page for its clickable elements so the record flow can offer a pick-list instead
 * of asking for hand-typed selectors. Runs a real browser navigation — seconds, not
 * instant — but interactive, so it isn't queued behind capture jobs.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
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

  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const clickables = await discoverClickables(page, parsed.data.url);
    return NextResponse.json({ clickables });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not scan the page.' },
      { status: 502 }
    );
  } finally {
    await context.close().catch(() => {});
  }
}

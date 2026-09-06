import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { runs } from '@/lib/db/schema';
import { getBrowser } from '@/lib/browser';
import { runCapture } from '@/lib/capture/injectCapture';
import { partitionPushes } from '@/lib/capture/filterEvents';

/**
 * Runs in the background, off the HTTP request/response cycle — the API route enqueues
 * this without awaiting it. Wrapped end-to-end in try/catch so one bad page (DNS
 * failure, nav timeout, page crash) surfaces a readable errorMessage instead of leaving
 * the run stuck at 'running' forever.
 */
export async function executeRun(runId: string): Promise<void> {
  await db.update(runs).set({ status: 'running', startedAt: new Date() }).where(eq(runs.id, runId));

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) return;

  let context: Awaited<ReturnType<Awaited<ReturnType<typeof getBrowser>>['newContext']>> | undefined;

  try {
    const browser = await getBrowser();
    context = await browser.newContext();
    const page = await context.newPage();

    const result = await runCapture(page, run.targetUrl);
    const { nonEvents } = partitionPushes(result.rawPushes);

    await db
      .update(runs)
      .set({
        status: 'complete',
        capturedEvents: result.events,
        rawPushCount: result.rawPushes.length,
        nonEventPushCount: result.filteredPushCount,
        nonEventPushes: nonEvents,
        finishedAt: new Date(),
      })
      .where(eq(runs.id, runId));
  } catch (err) {
    await db
      .update(runs)
      .set({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      })
      .where(eq(runs.id, runId));
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

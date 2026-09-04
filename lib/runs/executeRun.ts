import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { runs } from '@/lib/db/schema';
import { getBrowser } from '@/lib/browser';
import { runCapture, type RunCaptureOptions } from '@/lib/capture/injectCapture';
import { partitionPushes } from '@/lib/capture/filterEvents';
import { discover as discoverForms, drive as driveForm } from '@/lib/capture/drivers/form';

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

    const captureOptions: RunCaptureOptions = run.formSelector
      ? {
          // Re-discovers on the page runCapture has already navigated — the run only
          // stored the form's own selector (see the doc comment on runs.formSelector in
          // lib/db/schema.ts), not its field list, the same way a click-driven run only
          // stores clickSelector and re-resolves the rest live via describeClickTarget.
          interact: async (p) => {
            const forms = await discoverForms(p);
            const target = forms.find((f) => f.selector === run.formSelector);
            if (!target) throw new Error(`Form "${run.formSelector}" no longer resolves on this page.`);
            await driveForm(p, { ...target, allowSubmit: run.formAllowSubmit });
          },
        }
      : { clickSelector: run.clickSelector };

    const result = await runCapture(page, run.targetUrl, captureOptions);
    const { nonEvents } = partitionPushes(result.rawPushes);

    await db
      .update(runs)
      .set({
        status: 'complete',
        capturedEvents: result.events,
        rawPushCount: result.rawPushes.length,
        nonEventPushCount: result.filteredPushCount,
        nonEventPushes: nonEvents,
        clickTargetLabel: result.clickTarget?.label ?? null,
        clickTargetHref: result.clickTarget?.href ?? null,
        clickTargetResolvedCount: result.clickTarget?.resolvedCount ?? null,
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

import type { RunRow } from '@/lib/db/schema';

export interface ClickDriftWarning {
  kind: 'gone' | 'ambiguous' | 'changed';
  message: string;
}

type DriftInputRun = Pick<
  RunRow,
  'mode' | 'clickSelector' | 'clickLabel' | 'clickHref' | 'clickTargetLabel' | 'clickTargetHref' | 'clickTargetResolvedCount'
>;

/**
 * Only meaningful for a diff-mode run with a clickSelector: compares what the template
 * recorded (run.clickLabel/clickHref, copied from the template at run creation — see
 * app/api/runs/route.ts) against what runCapture actually found live immediately before
 * clicking (run.clickTarget*, from describeClickTarget in lib/capture/discoverClickables.ts).
 * A null clickTargetResolvedCount means the run never reached that check (still running,
 * errored, or record mode) — nothing to compare yet.
 */
export function computeClickDrift(run: DriftInputRun): ClickDriftWarning | null {
  if (run.mode !== 'diff' || !run.clickSelector || run.clickTargetResolvedCount === null) return null;

  if (run.clickTargetResolvedCount === 0) {
    return {
      kind: 'gone',
      message: `The recorded click target ("${run.clickLabel ?? run.clickSelector}") no longer matches anything on the page — it may have been removed or renamed.`,
    };
  }

  if (run.clickTargetResolvedCount > 1) {
    return {
      kind: 'ambiguous',
      message: `The click selector now matches ${run.clickTargetResolvedCount} elements instead of one — it may need to be re-recorded.`,
    };
  }

  const labelChanged = run.clickLabel !== null && run.clickTargetLabel !== run.clickLabel;
  const hrefChanged = run.clickLabel !== null && (run.clickHref ?? null) !== (run.clickTargetHref ?? null);
  if (labelChanged || hrefChanged) {
    return {
      kind: 'changed',
      message: `Clicked "${run.clickTargetLabel}"${run.clickTargetHref ? ` (${run.clickTargetHref})` : ''}, but the template recorded "${run.clickLabel}"${run.clickHref ? ` (${run.clickHref})` : ''} — the selector may now point at a different element.`,
    };
  }

  return null;
}

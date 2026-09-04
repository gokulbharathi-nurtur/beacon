import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { runs, templates } from '@/lib/db/schema';
import { computeDiff } from '@/lib/diff/computeDiff';
import { buildTemplateFromCapture } from '@/lib/diff/buildTemplateFromCapture';
import { auditCapture } from '@/lib/catalog/auditCapture';
import type { AuditResult, DiffResult, TemplateDefinition } from '@/lib/types';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // Computed on read, never persisted — always reflects the template's current field
  // rules, even if they were edited after this run happened.
  let diff: DiffResult | null = null;
  if (run.mode === 'diff' && run.status === 'complete' && run.templateId && run.capturedEvents) {
    const [template] = await db.select().from(templates).where(eq(templates.id, run.templateId));
    if (template) {
      diff = computeDiff(run.capturedEvents, { version: 1, events: template.events });
    }
  }

  // For record-mode runs, hand back a heuristic-classified starting template — the
  // record-flow UI shows this for the user to confirm/override before saving.
  let suggestedTemplate: TemplateDefinition | null = null;
  if (run.mode === 'record' && run.status === 'complete' && run.capturedEvents) {
    suggestedTemplate = buildTemplateFromCapture(run.capturedEvents);
  }

  // Also computed on read, for the same reason as the diff above: regenerating the catalog
  // re-judges every past audit against the current spec rather than freezing old verdicts.
  let audit: AuditResult | null = null;
  if (run.mode === 'audit' && run.status === 'complete' && run.capturedEvents) {
    audit = auditCapture(run.capturedEvents);
  }

  return NextResponse.json({ run, diff, suggestedTemplate, audit });
}

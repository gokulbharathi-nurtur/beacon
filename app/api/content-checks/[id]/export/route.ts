import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '@/lib/db/client';
import { contentChecks, contentCheckResults } from '@/lib/db/schema';
import { unmarkForDisplay } from '@/lib/capture/undefinedMarker';

const STATUS_LABELS: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  no_rule: 'No matching reference row',
  no_page_load_event: 'No page_loaded event captured',
};

// ARGB, chosen light enough that black text stays readable — same red/green vocabulary as
// the rest of the app's status colors (see StatusBadge/FieldDiffTable's status-* tokens),
// but spreadsheet software has no CSS variables to hand so these are hardcoded here.
const STATUS_FILL: Record<string, string> = {
  pass: 'FFDCFCE7',
  fail: 'FFFEE2E2',
  no_rule: 'FFF3F4F6',
  no_page_load_event: 'FFFEF3C7',
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [check] = await db.select().from(contentChecks).where(eq(contentChecks.id, id));
  if (!check) {
    return NextResponse.json({ error: 'Content check not found' }, { status: 404 });
  }
  const results = await db.select().from(contentCheckResults).where(eq(contentCheckResults.contentCheckId, id));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Content check');
  sheet.columns = [
    { header: 'Page URL', key: 'url', width: 60 },
    { header: 'Status', key: 'status', width: 26 },
    { header: 'Matched pattern', key: 'pattern', width: 34 },
    { header: 'Expected content_group', key: 'expGroup', width: 22 },
    { header: 'Actual content_group', key: 'actGroup', width: 22 },
    { header: 'Expected content_id', key: 'expId', width: 22 },
    { header: 'Actual content_id', key: 'actId', width: 22 },
    { header: 'Expected content_type', key: 'expType', width: 22 },
    { header: 'Actual content_type', key: 'actType', width: 22 },
    { header: 'Notes', key: 'notes', width: 50 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of results) {
    const notes = (r.fieldDiffs ?? []).map((d) => `${d.path}: ${d.kind}`).join('; ');

    const row = sheet.addRow({
      url: r.pageUrl,
      status: STATUS_LABELS[r.status] ?? r.status,
      pattern: r.matchedPattern ?? '(no reference row matched)',
      expGroup: r.expected?.contentGroup ?? '',
      actGroup: formatActualField(r.actual, 'content_group'),
      expId: r.expected?.contentId ?? '',
      actId: formatActualField(r.actual, 'content_id'),
      expType: r.expected?.contentType ?? '',
      actType: formatActualField(r.actual, 'content_type'),
      notes,
    });

    const fill = STATUS_FILL[r.status];
    if (fill) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="content-check-${id}.xlsx"`,
    },
  });
}

/** Distinguishes "no page object at all" / "key never pushed" / "pushed as literal
 * undefined" / "a real value" — the same four states the field-diff engine itself
 * distinguishes (lib/diff/flatten.ts) — rather than collapsing them all to a blank cell. */
function formatActualField(actual: unknown, key: string): string {
  if (actual === null || typeof actual !== 'object') return '(no page object)';
  const obj = actual as Record<string, unknown>;
  if (!(key in obj)) return '(missing)';
  const unmarked = unmarkForDisplay(obj[key]);
  if (unmarked === undefined) return '(undefined)';
  if (typeof unmarked === 'string') return unmarked;
  return JSON.stringify(unmarked);
}

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { enumeratePages } from '@/lib/sweep/enumeratePages';
import { classifyPages } from '@/lib/sweep/classifyPages';
import { assertValidTargetUrl, InvalidTargetUrlError } from '@/lib/urlGuard';

/**
 * A lighter-weight sibling to /api/content-checks/[id]/export — this crawls a site the
 * same way Coverage/Content check do (sitemap, or a same-origin BFS fallback) but does
 * nothing else: no browser, no page_loaded capture, no comparison.
 *
 * Groups the discovered URLs by page-type pattern (the same classifyPages bucketing
 * Coverage uses) and exports one example URL per pattern rather than every raw URL — a
 * detail-page type (property listings, news articles, branch pages) can easily be hundreds
 * of near-identical URLs, and one representative example is exactly what's useful for
 * building a content-map reference table (which is keyed by pattern, not by individual
 * page). A page-type with only one real URL still just shows that one URL.
 */
export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.searchParams.get('baseUrl');
  if (!baseUrl) {
    return NextResponse.json({ error: 'A "baseUrl" query parameter is required.' }, { status: 400 });
  }

  try {
    assertValidTargetUrl(baseUrl);
  } catch (err) {
    if (err instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const { urls, source } = await enumeratePages(baseUrl);
  const buckets = classifyPages(urls);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('URLs');
  sheet.columns = [
    { header: 'Pattern', key: 'pattern', width: 40 },
    { header: 'Example URL', key: 'url', width: 90 },
    { header: 'URL count', key: 'count', width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const bucket of buckets) {
    sheet.addRow({ pattern: bucket.pattern, url: bucket.urls[0], count: bucket.urls.length });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="page-urls.xlsx"',
      'X-Url-Count': String(urls.length),
      'X-Pattern-Count': String(buckets.length),
      'X-Url-Source': source,
    },
  });
}

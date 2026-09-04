import ExcelJS from 'exceljs';
import type { ContentMapRuleData } from '@/lib/types';
import { compilePagePattern } from './patternMatch';

export class ContentMapParseError extends Error {}

interface RawRow {
  pages: string;
  contentGroup: string;
  contentId: string;
  contentType: string;
}

const HEADER_MAP: Record<string, keyof RawRow> = {
  pages: 'pages',
  page: 'pages',
  url: 'pages',
  urls: 'pages',
  contentgroup: 'contentGroup',
  contentid: 'contentId',
  contenttype: 'contentType',
};

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Parses an uploaded reference table (.csv or .xlsx) into rows ready to store as
 * content_map_rules. Only the "pages" header is required — a sheet missing every
 * content_group/content_id/content_type column has nothing to check, so that's rejected
 * too rather than silently producing a content map that always passes. */
export async function parseContentMapFile(buffer: Buffer, filename: string): Promise<ContentMapRuleData[]> {
  const rows = /\.csv$/i.test(filename) ? parseCsvRows(buffer.toString('utf-8')) : await parseXlsxRows(buffer);
  return rowsToRuleData(rows);
}

async function parseXlsxRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      // A vertically merged cell (e.g. one "content_group" label spanning several "pages"
      // rows, a common way to author this exact table shape without repeating text) reads
      // as empty on every row but the merge's top-left anchor — resolve through .master so
      // every row in the merge gets the real value instead of silently reading blank.
      cells.push(cellText(cell.isMerged ? cell.master.value : cell.value));
    });
    rows.push(cells);
  });
  return rows;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
    if ('text' in value) return String(value.text);
    if ('result' in value) return String(value.result ?? '');
    return '';
  }
  return String(value);
}

/** Minimal RFC4180 parser — handles quoted fields, embedded commas, and embedded
 * newlines (a "pages" cell legitimately holds several URL patterns, one per line). */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      pushField();
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      pushRow();
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows;
}

function rowsToRuleData(rows: string[][]): ContentMapRuleData[] {
  const nonEmptyRows = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmptyRows.length === 0) {
    throw new ContentMapParseError('The uploaded file has no rows.');
  }

  const [headerRow, ...dataRows] = nonEmptyRows;
  const columnMap = new Map<number, keyof RawRow>();
  headerRow.forEach((header, i) => {
    const key = HEADER_MAP[normalizeHeaderKey(header)];
    if (key) columnMap.set(i, key);
  });

  const mappedKeys = new Set(columnMap.values());
  if (!mappedKeys.has('pages')) {
    throw new ContentMapParseError('Could not find a "pages" column in the header row.');
  }
  if (!mappedKeys.has('contentGroup') && !mappedKeys.has('contentId') && !mappedKeys.has('contentType')) {
    throw new ContentMapParseError(
      'Could not find any of "content_group", "content_id", or "content_type" columns in the header row.'
    );
  }

  const results: ContentMapRuleData[] = [];
  for (const dataRow of dataRows) {
    const raw: RawRow = { pages: '', contentGroup: '', contentId: '', contentType: '' };
    columnMap.forEach((key, i) => {
      raw[key] = dataRow[i] ?? '';
    });
    const parsed = toRuleData(raw);
    if (parsed) results.push(parsed);
  }
  return results;
}

function toRuleData(row: RawRow): ContentMapRuleData | null {
  const rawPagesText = row.pages.trim();
  if (!rawPagesText) return null;

  const patterns = rawPagesText
    .split(/\r?\n/)
    .map((line) => compilePagePattern(line))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => p.raw);

  return {
    rawPagesText,
    patterns,
    contentGroup: normalizeCell(row.contentGroup),
    contentId: normalizeCell(row.contentId),
    contentType: normalizeCell(row.contentType),
  };
}

function normalizeCell(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

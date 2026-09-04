import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { ContentMapParseError, parseContentMapFile } from './parseContentMap';

function csv(rows: string[][]): Buffer {
  const text = rows
    .map((row) => row.map((cell) => (cell.includes(',') || cell.includes('\n') || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
  return Buffer.from(text, 'utf-8');
}

describe('parseContentMapFile (csv)', () => {
  it('parses rows keyed off the header, splitting a multi-line pages cell into patterns', async () => {
    const buffer = csv([
      ['pages', 'content_group', 'content_id', 'content_type'],
      ['/\n/about', 'homepage', 'residential', 'brand'],
      ['/property/for-sale/in-london/\n/property/sold-in-london/ etc.', 'search results', 'residential', 'buyers, sellers'],
    ]);

    const rows = await parseContentMapFile(buffer, 'reference.csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ contentGroup: 'homepage', contentId: 'residential', contentType: 'brand' });
    expect(rows[0].patterns).toEqual(['/', '/about']);
    expect(rows[1].patterns).toEqual(['/property/for-sale/in-london/', '/property/sold-in-london/ etc.']);
  });

  it('treats a blank cell as null (not specified) and the literal word "undefined" as a real value', async () => {
    const buffer = csv([
      ['pages', 'content_group', 'content_id', 'content_type'],
      ['/branch-finder/', 'branch pages', 'undefined', 'brand'],
      ['/compliance/', 'undefined', '', 'brand'],
    ]);

    const rows = await parseContentMapFile(buffer, 'reference.csv');
    expect(rows[0].contentId).toBe('undefined');
    expect(rows[1].contentGroup).toBe('undefined');
    expect(rows[1].contentId).toBeNull();
  });

  it('is case- and spacing-insensitive on header names', async () => {
    const buffer = csv([
      ['Pages', 'Content Group', 'Content ID', 'Content Type'],
      ['/about', 'about pages', 'brand', 'brand'],
    ]);
    const rows = await parseContentMapFile(buffer, 'reference.csv');
    expect(rows).toHaveLength(1);
    expect(rows[0].contentGroup).toBe('about pages');
  });

  it('skips a data row whose pages cell is empty', async () => {
    const buffer = csv([
      ['pages', 'content_group', 'content_id', 'content_type'],
      ['', 'homepage', 'residential', 'brand'],
      ['/about', 'about pages', 'brand', 'brand'],
    ]);
    const rows = await parseContentMapFile(buffer, 'reference.csv');
    expect(rows).toHaveLength(1);
    expect(rows[0].contentGroup).toBe('about pages');
  });

  it('rejects a file with no "pages" column', async () => {
    const buffer = csv([
      ['content_group', 'content_id', 'content_type'],
      ['homepage', 'residential', 'brand'],
    ]);
    await expect(parseContentMapFile(buffer, 'reference.csv')).rejects.toThrow(ContentMapParseError);
  });

  it('rejects a file with none of the three content columns', async () => {
    const buffer = csv([
      ['pages', 'notes'],
      ['/about', 'just a note'],
    ]);
    await expect(parseContentMapFile(buffer, 'reference.csv')).rejects.toThrow(ContentMapParseError);
  });
});

describe('parseContentMapFile (xlsx)', () => {
  it('resolves a vertically merged content_group/content_id cell onto every row it spans', async () => {
    // Reproduces the real authoring pattern: one "services"/"residential" label merged
    // down the column across several distinct pages rows, each with its own content_type.
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reference');
    sheet.addRow(['pages', 'content_group', 'content_id', 'content_type']);
    sheet.addRow(['/our-services/mover-essentials/', 'services', 'residential', 'residential']);
    sheet.addRow(['/mover-essentials/', 'services', 'residential', 'residential']);
    sheet.addRow(['/our-services/marketing/', 'services', 'residential', 'sellers']);
    sheet.mergeCells('B2:B4');
    sheet.mergeCells('C2:C4');

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await parseContentMapFile(buffer, 'reference.xlsx');

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.contentGroup).toBe('services');
      expect(row.contentId).toBe('residential');
    }
    expect(rows[0].contentType).toBe('residential');
    expect(rows[2].contentType).toBe('sellers');
  });
});

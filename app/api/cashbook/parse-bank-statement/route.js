import { createServerSupabaseClient } from '../../../../lib/supabaseServer';
import { NextResponse } from 'next/server';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const runtime = 'nodejs';

const pdfjsDirectory = join(process.cwd(), 'node_modules', 'pdfjs-dist');
const standardFontDataUrl = pathToFileURL(join(pdfjsDirectory, 'standard_fonts') + sep).href;
const cMapUrl = pathToFileURL(join(pdfjsDirectory, 'cmaps') + sep).href;

function containsDate(cells) {
  return cells.some((cell) => {
    const value = String(cell).trim();
    const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const [, day, month, year] = dmy;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)) {
        return true;
      }
    }
    return value !== '' && !Number.isNaN(Date.parse(value));
  });
}

function getCellText(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
  return String(cell.text || value).trim();
}

async function parsePdf(file) {
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  const rows = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item) => item.str?.trim())
        .map((item) => ({
          text: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || 10,
        }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines = [];

      for (const item of items) {
        let line = pageLines.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2, item.height * 0.35));
        if (!line) {
          line = { y: item.y, items: [] };
          pageLines.push(line);
        }
        line.items.push(item);
      }

      for (const line of pageLines) {
        line.items.sort((a, b) => a.x - b.x);
        const cells = [];
        let text = '';
        let previousEnd = null;

        for (const item of line.items) {
          const gap = previousEnd === null ? 0 : item.x - previousEnd;
          if (gap > 24 && text) {
            cells.push(text.trim());
            text = item.text;
          } else {
            text += gap > 2 && text ? ` ${item.text}` : item.text;
          }
          previousEnd = item.x + item.width;
        }

        if (text.trim()) cells.push(text.trim());
        if (containsDate(cells)) rows.push(cells);
        if (rows.length > 5000) {
          throw new Error('This PDF has more than 5,000 rows. Split it into smaller files and try again.');
        }
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return rows;
}

async function parseWorkbook(file) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
  const sheets = [];

  for (const worksheet of workbook.worksheets) {
    let headerRowNumber = 0;
    let bestHeaderScore = 0;

    for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 30); rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values = Array.from({ length: row.cellCount }, (_, index) => getCellText(row.getCell(index + 1)));
      const normalized = values.map((value) => value.toLowerCase().replace(/[^a-z]/g, ''));
      const hasDate = normalized.some((value) => value.includes('date'));
      const hasDescription = normalized.some((value) => /description|details|memo|narration|particular/.test(value));
      const moneyColumns = normalized.filter((value) => /amount|debit|credit|withdrawal|deposit/.test(value)).length;
      const score = (hasDate ? 2 : 0) + (hasDescription ? 2 : 0) + Math.min(moneyColumns, 2);

      if (hasDate && (hasDescription || moneyColumns > 0) && score > bestHeaderScore) {
        bestHeaderScore = score;
        headerRowNumber = rowNumber;
      }
    }

    if (!headerRowNumber) continue;

    const headerRow = worksheet.getRow(headerRowNumber);
    const columnCount = Math.max(headerRow.cellCount, worksheet.columnCount);
    const fields = [];
    for (let column = 1; column <= columnCount; column += 1) {
      const label = getCellText(headerRow.getCell(column)) || `Column ${column}`;
      const duplicateCount = fields.filter((field) => field === label || field.startsWith(`${label} (`)).length;
      fields.push(duplicateCount ? `${label} (${duplicateCount + 1})` : label);
    }
    const dateColumnIndex = fields.findIndex((field) => field.toLowerCase().includes('date'));

    const rows = [];
    for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values = fields.map((_, index) => getCellText(row.getCell(index + 1)));
      if (values.some(Boolean) && containsDate([values[dateColumnIndex]])) {
        rows.push(Object.fromEntries(fields.map((field, index) => [field, values[index]])));
      }
      if (rows.length > 5000) {
        throw new Error(`Worksheet "${worksheet.name}" has more than 5,000 rows. Split it into smaller files and try again.`);
      }
    }

    if (rows.length) sheets.push({ name: worksheet.name, fields, rows });
  }

  if (!sheets.length) {
    throw new Error('No transaction worksheets found. Include a header row with date, description, and amount columns.');
  }
  return sheets;
}

export async function POST(request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to import a bank statement.' }, { status: 401 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 });
  }

  const file = formData.get('file');
  const extension = file?.name?.toLowerCase().split('.').pop();
  if (!file || typeof file.arrayBuffer !== 'function' || !['pdf', 'xlsx'].includes(extension)) {
    return NextResponse.json({ error: 'Choose a PDF or XLSX bank statement.' }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: 'Statement files must be 4 MB or smaller.' }, { status: 413 });
  }

  try {
    if (extension === 'pdf') return NextResponse.json({ rows: await parsePdf(file) });
    return NextResponse.json({ sheets: await parseWorkbook(file) });
  } catch (error) {
    console.error(`Could not parse uploaded bank statement ${extension.toUpperCase()}:`, error);
    const parserMessage = error instanceof Error ? error.message : 'Unknown parser error.';
    const errorMessage = extension === 'pdf' && /password/i.test(parserMessage)
      ? 'This PDF is password-protected. Remove its password and upload it again.'
      : `${extension.toUpperCase()} parser error: ${parserMessage.slice(0, 240)}`;
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}

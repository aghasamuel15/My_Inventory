import { createServerSupabaseClient } from '../../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
  if (!file || typeof file.arrayBuffer !== 'function' || !file.name?.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Choose a PDF bank statement.' }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: 'PDF files must be 4 MB or smaller.' }, { status: 413 });
  }

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
      standardFontDataUrl: new URL('../../standard_fonts/', import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href,
      cMapUrl: new URL('../../cmaps/', import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href,
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
          if (cells.length) rows.push(cells);
          if (rows.length > 5000) {
            return NextResponse.json({ error: 'This PDF has more than 5,000 rows. Split it into smaller files and try again.' }, { status: 413 });
          }
        }
      }
    } finally {
      await loadingTask.destroy();
    }

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('Could not parse uploaded bank statement PDF:', error);
    const parserMessage = error instanceof Error ? error.message : 'Unknown PDF parser error.';
    const errorMessage = /password/i.test(parserMessage)
      ? 'This PDF is password-protected. Remove its password and upload it again.'
      : `PDF parser error: ${parserMessage.slice(0, 240)}`;
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}

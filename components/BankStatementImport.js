'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { getBusinessContext } from '../lib/businessContext';

function parseAmount(value) {
  const cleaned = String(value ?? '').replace(/[₦$,\s]/g, '');
  if (!cleaned) return null;
  if (/^\(.*\)$/.test(cleaned)) return -Number(cleaned.slice(1, -1));
  const amount = Number(cleaned.replace(/[()]/g, (character) => character === '(' ? '-' : ''));
  return Number.isFinite(amount) ? amount : null;
}

function parseDate(value) {
  const text = String(value ?? '').trim();
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, first, second, year] = dmy;
    const date = new Date(Number(year), Number(second) - 1, Number(first));
    if (date.getFullYear() === Number(year) && date.getMonth() === Number(second) - 1 && date.getDate() === Number(first)) {
      return `${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
    }
    return '';
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetween(left, right) {
  return Math.abs((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86400000);
}

async function parsePdfFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/cashbook/parse-bank-statement', { method: 'POST', body: formData });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Could not read the PDF.');
  }

  const lines = (result.rows || []).filter((line) => line.some((cell) => parseDate(cell)));
  if (!lines.length) {
    throw new Error('No transaction rows found. Make sure this PDF contains selectable text and a date column.');
  }

  const columnCount = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const fields = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  const rows = lines.map((line) => Object.fromEntries(fields.map((field, index) => [field, line[index] || ''])));
  return { fields, rows };
}

async function parseXlsxFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/cashbook/parse-bank-statement', { method: 'POST', body: formData });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Could not read the XLSX file.');
  }
  return result.sheets || [];
}

function fieldSelect(label, value, fields, onChange) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {label}
      <select className="input bg-slate-50" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose column</option>
        {fields.map((field) => <option key={field} value={field}>{field}</option>)}
      </select>
    </label>
  );
}

export default function BankStatementImport({ supabase, userId, canWrite }) {
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [fields, setFields] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({ date: '', description: '', amountMode: 'signed', amount: '', debit: '', credit: '' });
  const [reviewRows, setReviewRows] = useState([]);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function updateMapping(key, value) {
    setMapping((current) => ({ ...current, [key]: value }));
    setReviewed(false);
    setReviewRows([]);
  }

  function setParsedRows(columns, parsedRows) {
    if (!parsedRows.length) {
      setError('The file has no transaction rows.');
      return;
    }

    setFields(columns);
    setRows(parsedRows);
    const normalizedHeaders = columns.map((field) => [field, field.toLowerCase().replace(/[^a-z]/g, '')]);
    const findField = (terms) => normalizedHeaders.find(([, normalized]) => terms.includes(normalized))?.[0] || '';
    const dateField = findField(['date', 'transactiondate', 'valuedate', 'posteddate'])
      || columns.find((field) => parsedRows.slice(0, 20).filter((row) => parseDate(row[field])).length >= Math.min(3, parsedRows.length))
      || '';
    const dateIndex = columns.indexOf(dateField);
    const amountField = findField(['amount', 'transactionamount', 'value']);
    const debitField = findField(['debit', 'withdrawal', 'withdrawals']);
    const creditField = findField(['credit', 'deposit', 'deposits']);

    setMapping({
      date: dateField,
      description: findField(['description', 'details', 'memo', 'narration', 'transactiondescription'])
        || columns[dateIndex + 1]
        || '',
      amountMode: !amountField && debitField && creditField ? 'columns' : 'signed',
      amount: amountField,
      debit: debitField,
      credit: creditField,
    });
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    setReviewed(false);
    setReviewRows([]);
    setRows([]);
    setSheets([]);
    setSelectedSheet('');
    setFileName(file.name);
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      setBusy(true);
      parsePdfFile(file)
        .then(({ fields: columns, rows: parsedRows }) => setParsedRows(columns, parsedRows))
        .catch((parseError) => setError(`Could not read the PDF: ${parseError.message || 'Unknown PDF error.'}`))
        .finally(() => setBusy(false));
      return;
    }

    if (file.name.toLowerCase().endsWith('.xlsx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      setBusy(true);
      parseXlsxFile(file)
        .then((parsedSheets) => {
          if (!parsedSheets.length) throw new Error('No transaction worksheets found in this workbook.');
          setSheets(parsedSheets);
          setSelectedSheet(parsedSheets[0].name);
          setParsedRows(parsedSheets[0].fields, parsedSheets[0].rows);
        })
        .catch((parseError) => setError(`Could not read the XLSX file: ${parseError.message || 'Unknown spreadsheet error.'}`))
        .finally(() => setBusy(false));
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        if (result.errors.length) {
          setError(`Could not read the CSV: ${result.errors[0].message}`);
          return;
        }
        const parsedRows = result.data.filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));
        const columns = result.meta.fields || Object.keys(parsedRows[0] || {});
        setParsedRows(columns, parsedRows);
      },
      error: (parseError) => setError(`Could not read the CSV: ${parseError.message}`),
    });
  }

  function normalizeRows() {
    return rows.map((row, index) => {
      const date = parseDate(row[mapping.date]);
      const description = String(row[mapping.description] ?? '').trim();
      let amount;
      let direction;
      if (mapping.amountMode === 'signed') {
        amount = parseAmount(row[mapping.amount]);
        direction = amount < 0 ? 'expense' : 'income';
        amount = Math.abs(amount ?? 0);
      } else {
        const debit = parseAmount(row[mapping.debit]) || 0;
        const credit = parseAmount(row[mapping.credit]) || 0;
        amount = debit || credit;
        direction = debit > 0 ? 'expense' : 'income';
      }
      return { index, date, description, amount, direction, source: row };
    });
  }

  async function reviewTransactions() {
    setBusy(true);
    setError('');
    setMessage('');
    const normalized = normalizeRows();
    const invalidIndex = normalized.findIndex((row) => !row.date || !row.description || !Number.isFinite(row.amount) || row.amount <= 0);
    if (!mapping.date || !mapping.description ||
      (mapping.amountMode === 'signed' && !mapping.amount) ||
      (mapping.amountMode === 'columns' && (!mapping.debit || !mapping.credit))) {
      setError('Map the date, description, and amount columns before reviewing.');
      setBusy(false);
      return;
    }
    if (invalidIndex !== -1) {
      setError(`Row ${invalidIndex + 2} needs a valid date, description, and positive amount. Fix the column mapping or remove the row from the CSV.`);
      setBusy(false);
      return;
    }

    try {
      const { business_id: businessId } = await getBusinessContext(supabase, userId);
      const dates = normalized.map((row) => row.date).sort();
      const from = new Date(`${dates[0]}T00:00:00Z`);
      const to = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 3);
      to.setUTCDate(to.getUTCDate() + 3);
      const fromDate = from.toISOString().slice(0, 10);
      const toDate = to.toISOString().slice(0, 10);
      const [sales, expenses, payments] = await Promise.all([
        supabase.from('sales').select('id, sale_date, product_name, description, amount').eq('user_id', businessId).gte('sale_date', fromDate).lte('sale_date', toDate).limit(5000),
        supabase.from('expenses').select('id, expense_date, category, description, amount').eq('user_id', businessId).gte('expense_date', fromDate).lte('expense_date', toDate).limit(5000),
        supabase.from('invoice_payments').select('id, payment_date, reference, notes, amount, invoice:invoices(invoice_number)').eq('user_id', businessId).gte('payment_date', fromDate).lte('payment_date', toDate).limit(5000),
      ]);
      const failed = sales.error || expenses.error || payments.error;
      if (failed) throw new Error(failed.message);
      const candidates = [
        ...(sales.data || []).map((item) => ({ ...item, type: 'sale', date: item.sale_date, label: item.product_name || item.description || 'Sale', direction: 'income' })),
        ...(expenses.data || []).map((item) => ({ ...item, type: 'expense', date: item.expense_date, label: item.category || item.description || 'Expense', direction: 'expense' })),
        ...(payments.data || []).map((item) => ({ ...item, type: 'invoice_payment', date: item.payment_date, label: item.invoice?.invoice_number ? `Invoice ${item.invoice.invoice_number}` : item.reference || item.notes || 'Invoice payment', direction: 'income' })),
      ];
      const nextRows = normalized.map((row) => {
        const matches = candidates
          .filter((candidate) => candidate.direction === row.direction &&
            Math.round(Number(candidate.amount) * 100) === Math.round(row.amount * 100) &&
            daysBetween(candidate.date, row.date) <= 3)
          .sort((a, b) => daysBetween(a.date, row.date) - daysBetween(b.date, row.date));
        return { ...row, matches, selected: matches.length ? `${matches[0].type}:${matches[0].id}` : '' };
      });
      setReviewRows(nextRows);
      setReviewed(true);
    } catch (reviewError) {
      setError(reviewError.message || 'Could not suggest transaction matches.');
    } finally {
      setBusy(false);
    }
  }

  async function fingerprint(row, occurrence) {
    const value = `${row.date}|${row.description}|${row.amount.toFixed(2)}|${row.direction}|${occurrence}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function importTransactions() {
    setBusy(true);
    setError('');
    setMessage('');
    let imported = 0;
    let failures = 0;
    const occurrences = new Map();
    const errorMessages = [];
    for (const row of reviewRows) {
      const duplicateKey = `${row.date}|${row.description}|${row.amount.toFixed(2)}|${row.direction}`;
      const occurrence = occurrences.get(duplicateKey) || 0;
      occurrences.set(duplicateKey, occurrence + 1);
      const [matchedType, matchedId] = row.selected ? row.selected.split(':') : [null, null];
      try {
        const result = await supabase.rpc('import_bank_statement_transaction', {
          p_transaction_date: row.date,
          p_description: row.description,
          p_amount: row.amount,
          p_direction: row.direction,
          p_fingerprint: await fingerprint(row, occurrence),
          p_matched_type: matchedType,
          p_matched_id: matchedId,
        });
        if (result.error) {
          failures += 1;
          if (errorMessages.length < 3) errorMessages.push(result.error.message);
        } else {
          imported += 1;
        }
      } catch (importError) {
        failures += 1;
        if (errorMessages.length < 3) errorMessages.push(importError.message || 'Unexpected import error.');
      }
    }
    setBusy(false);
    if (failures) {
      setError(`${imported} transaction(s) processed; ${failures} failed. ${errorMessages.join(' ')}`);
    } else {
      setMessage(`${imported} transaction(s) processed. Matched rows were linked without creating duplicates; unmatched rows were added as bank adjustments.`);
      setRows([]);
      setReviewRows([]);
      setReviewed(false);
      setFileName('');
      setSheets([]);
      setSelectedSheet('');
      window.dispatchEvent(new Event('cashbook-transactions-changed'));
    }
  }

  if (!canWrite) return null;

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-slate-900">Import bank statement</h2>
      <p className="mt-1 text-sm text-slate-600">Upload a CSV, text-based PDF, or XLSX, map its columns, review suggested matches, and import unmatched rows as bank cashbook adjustments. Scanned PDFs are not supported.</p>
      <label className="mt-4 flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
        Bank statement file (CSV, PDF, or XLSX)
        <input type="file" accept=".csv,text/csv,.pdf,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} className="text-sm font-normal" />
      </label>
      {busy && !rows.length && <p role="status" className="mt-3 text-sm text-slate-600">Reading bank statement...</p>}
      {fileName && rows.length > 0 && (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-medium text-slate-700">{fileName} · {rows.length} row(s)</p>
          {sheets.length > 1 && (
            <label className="flex max-w-md flex-col gap-1 text-xs font-semibold text-slate-600">
              Worksheet to import
              <select
                className="input bg-slate-50"
                value={selectedSheet}
                onChange={(event) => {
                  const sheet = sheets.find((item) => item.name === event.target.value);
                  if (!sheet) return;
                  setSelectedSheet(sheet.name);
                  setReviewed(false);
                  setReviewRows([]);
                  setParsedRows(sheet.fields, sheet.rows);
                }}
              >
                {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {fieldSelect('Date column', mapping.date, fields, (value) => updateMapping('date', value))}
            {fieldSelect('Description column', mapping.description, fields, (value) => updateMapping('description', value))}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Amount format
              <select className="input bg-slate-50" value={mapping.amountMode} onChange={(event) => updateMapping('amountMode', event.target.value)}>
                <option value="signed">Signed amount column</option>
                <option value="columns">Separate debit and credit columns</option>
              </select>
            </label>
            {mapping.amountMode === 'signed'
              ? fieldSelect('Amount column (negative = expense)', mapping.amount, fields, (value) => updateMapping('amount', value))
              : <>
                {fieldSelect('Debit column', mapping.debit, fields, (value) => updateMapping('debit', value))}
                {fieldSelect('Credit column', mapping.credit, fields, (value) => updateMapping('credit', value))}
              </>}
          </div>
          <button type="button" className="btn-secondary" onClick={reviewTransactions} disabled={busy}>
            {busy ? 'Reviewing...' : 'Review suggested matches'}
          </button>
        </div>
      )}
      {reviewed && (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Choose a suggested match for each row, or leave it unmatched to add it to the bank cashbook.</p>
          <div className="max-h-96 space-y-2 overflow-auto">
            {reviewRows.map((row) => (
              <label key={row.index} className="grid gap-2 rounded-xl border border-slate-200 p-3 text-xs sm:grid-cols-[1fr_1.2fr]">
                <span className="text-slate-700">
                  <strong>{row.date}</strong> · {row.description}<br />
                  {row.direction === 'income' ? 'Income' : 'Expense'} · ₦{row.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
                <select
                  className="input min-h-10 bg-slate-50"
                  value={row.selected}
                  onChange={(event) => setReviewRows((current) => current.map((item) => item.index === row.index ? { ...item, selected: event.target.value } : item))}
                >
                  <option value="">No match — import as adjustment</option>
                  {row.matches.map((match) => (
                    <option key={`${match.type}:${match.id}`} value={`${match.type}:${match.id}`}>
                      Match {match.type.replace('_', ' ')} · {match.date} · {match.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button type="button" className="btn-primary" onClick={importTransactions} disabled={busy}>
            {busy ? 'Importing...' : `Import ${reviewRows.length} transaction(s)`}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    </section>
  );
}

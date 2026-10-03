'use client';

export default function PrintStatementButton() {
  return (
    <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}

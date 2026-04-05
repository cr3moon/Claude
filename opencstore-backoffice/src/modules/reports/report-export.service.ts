/**
 * src/modules/reports/report-export.service.ts
 *
 * CSV and PDF export helpers for report data.
 * CSV export runs in the renderer.
 * PDF export triggers window.print() with print-optimised CSS
 * (full headless PDF generation is a v0.2 roadmap item).
 */

import type { ReportColumn, ReportDefinition } from './report-definitions';

// ─── Pure CSV builder (testable without DOM) ─────────────────────────────────

/**
 * Build a CSV string from column definitions and data rows.
 * Values containing commas, quotes or newlines are wrapped in double-quotes.
 */
export function buildCsvString(
  columns: ReportColumn[],
  rows: Record<string, unknown>[]
): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const header = columns.map(c => escape(c.label)).join(',');
  const body   = rows.map(row => columns.map(c => escape(row[c.key])).join(','));
  return [header, ...body].join('\n');
}

// ─── CSV export ───────────────────────────────────────────────────────────────

/**
 * Convert report rows into a CSV string and trigger a browser download.
 */
export function exportToCsv(
  rows: Record<string, unknown>[],
  definition: ReportDefinition,
  filename?: string
): void {
  if (!rows.length) {
    alert('No data to export.');
    return;
  }

  const cols   = definition.columns;
  const header = cols.map(c => `"${c.label}"`).join(',');
  const body   = rows.map(row =>
    cols.map(c => {
      const raw = row[c.key];
      if (raw === null || raw === undefined) return '""';
      return `"${String(raw).replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csvContent = [header, ...body].join('\r\n');
  const blob       = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url        = URL.createObjectURL(blob);
  const link       = document.createElement('a');

  link.href     = url;
  link.download = filename ?? `${definition.type}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export all data rows to CSV regardless of column definitions.
 * Useful for raw data dumps where the column list is dynamic.
 */
export function exportRawToCsv(rows: Record<string, unknown>[], filename: string): void {
  if (!rows.length) { alert('No data to export.'); return; }
  const keys   = Object.keys(rows[0]);
  const header = keys.map(k => `"${k}"`).join(',');
  const body   = rows.map(row =>
    keys.map(k => {
      const v = row[k];
      return v === null || v === undefined ? '""' : `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const blob = new Blob([[header, ...body].join('\r\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Print / PDF ──────────────────────────────────────────────────────────────

/**
 * Open the browser print dialog.
 * Print-optimised styles are applied via @media print rules in globals.css.
 * Full server-side PDF generation is planned for v0.2.
 */
export function printReport(): void {
  window.print();
}

/**
 * Stub for future headless PDF generation.
 * When implemented this will call an Electron IPC handler that uses
 * webContents.printToPDF() and saves to a user-chosen path.
 */
export async function exportToPdf(_reportId: string): Promise<void> {
  // TODO (v0.2): call window.electronAPI.exportReportPdf(reportId)
  alert(
    'PDF export is coming in v0.2.  ' +
    'For now, use File → Print and choose "Save as PDF" in your print dialog.'
  );
}

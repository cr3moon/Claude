import React from 'react';
import { fmtMoney, fmtPctNum } from '../../lib/currency';
import { fmtDateTime, fmtDate } from '../../lib/date';
import type { ReportColumn } from '../../modules/reports/report-definitions';

interface DataTableProps {
  columns:  ReportColumn[];
  rows:     Record<string, unknown>[];
  loading?: boolean;
  emptyMsg?: string;
  maxHeight?: string;
}

function formatCell(value: unknown, format: ReportColumn['format']): string {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency':  return fmtMoney(Number(value));
    case 'percent':   return fmtPctNum(Number(value));
    case 'integer':   return Number(value).toLocaleString();
    case 'datetime':  return fmtDateTime(String(value));
    case 'date':      return fmtDate(String(value));
    default:          return String(value);
  }
}

export default function DataTable({ columns, rows, loading, emptyMsg, maxHeight }: DataTableProps) {
  if (loading) {
    return <div className="p-6 text-center text-gray-400 animate-pulse">Loading…</div>;
  }

  if (!rows.length) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        {emptyMsg ?? 'No data available.'}
      </div>
    );
  }

  return (
    <div className={`overflow-auto ${maxHeight ? `max-h-[${maxHeight}]` : ''}`}>
      <table className="table-base w-full">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td
                  key={col.key}
                  className={col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : ''}
                >
                  {formatCell(row[col.key], col.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

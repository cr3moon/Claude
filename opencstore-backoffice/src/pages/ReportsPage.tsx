import React, { useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import EmptyState from '../components/common/EmptyState';
import { ReportService } from '../modules/reports/report.service';
import { REPORT_DEFINITIONS, REPORT_DEF_MAP } from '../modules/reports/report-definitions';
import { exportToCsv, printReport } from '../modules/reports/report-export.service';
import { fmtDate, daysAgoIso, todayIso } from '../lib/date';

export default function ReportsPage() {
  const [selectedId, setSelectedId] = useState(REPORT_DEFINITIONS[0].id);
  const [dateFrom,   setDateFrom]   = useState(daysAgoIso(30));
  const [dateTo,     setDateTo]     = useState(todayIso());
  const [rows,       setRows]       = useState<Record<string, unknown>[]>([]);
  const [running,    setRunning]    = useState(false);
  const [ran,        setRan]        = useState(false);

  const def = REPORT_DEF_MAP[selectedId];

  async function runReport() {
    setRunning(true);
    setRan(false);
    try {
      const result = await ReportService.generate(selectedId, { date_from: dateFrom, date_to: dateTo });
      setRows(result as Record<string, unknown>[]);
      setRan(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Generate and export store reports" />

      {/* Controls */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Report Type</label>
            <select
              className="input w-full"
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setRan(false); }}
            >
              {REPORT_DEFINITIONS.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
            <input
              type="date"
              className="input"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>

          <button className="btn-primary" onClick={runReport} disabled={running}>
            {running ? 'Running…' : 'Run Report'}
          </button>

          {ran && rows.length > 0 && (
            <>
              <button className="btn-secondary" onClick={() => exportToCsv(def.columns, rows, def.id)}>
                Export CSV
              </button>
              <button className="btn-secondary" onClick={() => printReport(def.name, def.columns, rows)}>
                Print
              </button>
            </>
          )}
        </div>

        {def.description && (
          <p className="text-xs text-gray-400 mt-3">{def.description}</p>
        )}
      </div>

      {/* Results */}
      {!ran ? (
        <EmptyState
          title="No report generated"
          description="Select a report type and click Run Report."
          icon="≡"
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">{def.name}</h2>
            <span className="text-xs text-gray-400">{rows.length} rows</span>
          </div>
          <DataTable
            columns={def.columns}
            rows={rows}
            loading={running}
            emptyMsg="No data for selected period."
          />
        </div>
      )}
    </>
  );
}

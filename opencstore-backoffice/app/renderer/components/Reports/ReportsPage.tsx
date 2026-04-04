import React, { useEffect, useState } from 'react';

const REPORT_TYPES = [
  { value: 'daily_shift',       label: 'Daily Shift Summary' },
  { value: 'eod_close',         label: 'End-of-Day Close' },
  { value: 'sales_by_dept',     label: 'Sales by Department' },
  { value: 'sales_by_category', label: 'Sales by Category' },
  { value: 'sales_by_item',     label: 'Sales by Item' },
  { value: 'tender_summary',    label: 'Tender Summary' },
  { value: 'tax_summary',       label: 'Tax Summary' },
  { value: 'voids_refunds',     label: 'Voids & Refunds' },
  { value: 'cashier_performance','label': 'Cashier Performance' },
  { value: 'margin_report',     label: 'Margin Report' },
  { value: 'price_change_history','label': 'Price Change History' },
  { value: 'item_compliance',   label: 'Item Standards Compliance' },
  { value: 'over_short',        label: 'Over/Short Summary' },
];

function today() { return new Date().toISOString().split('T')[0]; }
function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

function fmtCurrency(n: unknown) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

function renderTableData(data: unknown): React.ReactNode {
  if (!data) return <div className="text-gray-400">No data</div>;
  if (Array.isArray(data) && data.length > 0) {
    const keys = Object.keys(data[0] as Record<string, unknown>);
    return (
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>{keys.map(k => <th key={k}>{k.replace(/_/g, ' ')}</th>)}</tr>
          </thead>
          <tbody>
            {(data as Record<string, unknown>[]).map((row, i) => (
              <tr key={i}>
                {keys.map(k => (
                  <td key={k}>
                    {typeof row[k] === 'number' && (k.includes('sale') || k.includes('amount') || k.includes('price') || k.includes('cost') || k.includes('margin_dollar'))
                      ? fmtCurrency(row[k])
                      : String(row[k] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (typeof data === 'object') {
    return (
      <pre className="text-xs bg-gray-50 p-4 rounded border border-gray-200 overflow-auto max-h-96">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  return <div>{String(data)}</div>;
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState('sales_by_dept');
  const [startDate, setStartDate]   = useState(weekAgo());
  const [endDate, setEndDate]       = useState(today());
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<Record<string, unknown> | null>(null);
  const [archive, setArchive]       = useState<unknown[]>([]);
  const [tab, setTab]               = useState<'run' | 'archive'>('run');

  useEffect(() => {
    window.electronAPI.getReportArchive().then(a => setArchive(a));
  }, []);

  const generate = async () => {
    setLoading(true);
    setResult(null);
    const r = await window.electronAPI.generateReport({ reportType, startDate, endDate });
    setResult(r as Record<string, unknown>);
    setLoading(false);
    window.electronAPI.getReportArchive().then(a => setArchive(a));
  };

  const printReport = () => { window.print(); };

  const exportCsv = () => {
    if (!result?.data) return;
    const data = Array.isArray(result.data) ? result.data : (result.data as Record<string,unknown>)?.['totals'] ? [result.data] : [];
    if (!Array.isArray(data) || !data.length) { alert('This report type does not support CSV export directly.'); return; }
    const keys = Object.keys(data[0] as Record<string,unknown>);
    const rows = [keys.join(','), ...(data as Record<string,unknown>[]).map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${reportType}_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Generate and archive operational reports</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('run')} className={`btn-secondary text-xs ${tab === 'run' ? 'bg-brand-50 border-brand-300' : ''}`}>Run Report</button>
          <button onClick={() => setTab('archive')} className={`btn-secondary text-xs ${tab === 'archive' ? 'bg-brand-50 border-brand-300' : ''}`}>Archive ({archive.length})</button>
        </div>
      </div>

      {tab === 'run' && (
        <>
          <div className="card mb-6">
            <div className="card-body">
              <div className="grid grid-cols-4 gap-4 items-end">
                <div>
                  <label className="label">Report Type</label>
                  <select className="input" value={reportType} onChange={e => setReportType(e.target.value)}>
                    {REPORT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <button onClick={generate} className="btn-primary" disabled={loading}>
                  {loading ? '⏳ Generating…' : 'Generate Report'}
                </button>
              </div>
            </div>
          </div>

          {result && (
            <div className="card">
              <div className="card-header no-print">
                <h3 className="font-semibold">
                  {REPORT_TYPES.find(r => r.value === reportType)?.label} — {startDate} to {endDate}
                </h3>
                <div className="flex gap-2">
                  <button onClick={exportCsv} className="btn-secondary text-xs">Export CSV</button>
                  <button onClick={printReport} className="btn-secondary text-xs">Print</button>
                </div>
              </div>
              <div className="card-body">
                {renderTableData(result.data)}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'archive' && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-800">Saved Reports</h3>
          </div>
          <div className="card-body p-0">
            {archive.length === 0 ? (
              <div className="p-6 text-gray-400">No reports have been generated yet.</div>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Generated</th>
                    <th>Report Type</th>
                    <th>Period</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(archive as Record<string, unknown>[]).map(r => (
                    <tr key={r.id as string}>
                      <td className="text-xs text-gray-500">{new Date(r.created_at as string).toLocaleString()}</td>
                      <td><span className="badge-blue">{r.report_type as string}</span></td>
                      <td className="text-sm">{r.report_period_start as string} – {r.report_period_end as string}</td>
                      <td>
                        <button
                          onClick={async () => {
                            const full = await window.electronAPI.getReportById(r.id as string) as Record<string, unknown>;
                            setResult({ data: JSON.parse(full?.data_snapshot as string ?? '{}') });
                            setTab('run');
                          }}
                          className="text-brand-600 text-xs hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

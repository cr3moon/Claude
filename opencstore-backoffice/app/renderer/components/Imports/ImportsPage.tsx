import React, { useEffect, useState } from 'react';

interface ImportJob {
  id: string;
  source_type: string;
  adapter_type: string;
  status: string;
  records_total: number;
  records_ok: number;
  records_error: number;
  triggered_by_name: string;
  created_at: string;
  completed_at: string | null;
  error_detail: string | null;
}

function statusBadge(s: string) {
  if (s === 'complete') return <span className="badge-green">Complete</span>;
  if (s === 'failed')   return <span className="badge-red">Failed</span>;
  if (s === 'running')  return <span className="badge-blue">Running</span>;
  return <span className="badge-gray">{s}</span>;
}

export default function ImportsPage() {
  const [history, setHistory]     = useState<ImportJob[]>([]);
  const [loading, setLoading]     = useState(true);
  const [running, setRunning]     = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);

  const load = () => {
    window.electronAPI.getImportHistory().then(h => {
      setHistory(h as ImportJob[]);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const runMock = async () => {
    setRunning(true);
    setLastResult(null);
    const result = await window.electronAPI.runMockImport();
    setLastResult(result as Record<string, unknown>);
    setRunning(false);
    load();
  };

  const importFile = async () => {
    const dialog = await window.electronAPI.openFileDialog();
    if (dialog.canceled || !dialog.filePaths[0]) return;
    const filePath = dialog.filePaths[0];
    const ext = filePath.split('.').pop()?.toLowerCase();
    const format = ext === 'xml' ? 'xml_plu' : 'csv_pricebook';

    setRunning(true);
    setLastResult(null);
    const result = await window.electronAPI.importFromFile(filePath, format);
    setLastResult(result as Record<string, unknown>);
    setRunning(false);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Data Import</h1>
          <p className="page-subtitle">Import PLU, pricebook, and transaction data from your POS</p>
        </div>
      </div>

      <div className="alert-info mb-6 text-xs leading-relaxed">
        <strong>How import works:</strong> A backup snapshot is created before every import. Your original source files are preserved.
        Data is normalized and saved locally. No POS data is ever modified by the import process.
      </div>

      {/* Import options */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card">
          <div className="card-body">
            <div className="text-2xl mb-3">🧪</div>
            <h3 className="font-semibold text-gray-800 mb-1">Load Sample Data</h3>
            <p className="text-sm text-gray-500 mb-4">
              Load the built-in mock dataset to explore all features without a live POS.
              Includes sample departments, categories, PLU items, and known data quality issues.
            </p>
            <button onClick={runMock} className="btn-primary" disabled={running}>
              {running ? 'Importing…' : 'Load Sample Data'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="text-2xl mb-3">📂</div>
            <h3 className="font-semibold text-gray-800 mb-1">Import from File</h3>
            <p className="text-sm text-gray-500 mb-4">
              Select an XML PLU export or CSV pricebook file exported from your POS back-office software.
              Supported: XML PLU files and CSV pricebook exports.
            </p>
            <button onClick={importFile} className="btn-secondary" disabled={running}>
              Select File…
            </button>
          </div>
        </div>
      </div>

      {/* Last result */}
      {lastResult && (
        <div className={`mb-6 ${lastResult.completed ? 'alert-success' : 'alert-error'}`}>
          {lastResult.completed ? (
            <span>
              Import complete: <strong>{lastResult.recordsOk as number}</strong> records imported,{' '}
              {lastResult.recordsSkipped as number} skipped, {lastResult.recordsError as number} errors.
              {(lastResult.dryRun as boolean) && ' (Dry-run only – no data was saved.)'}
            </span>
          ) : (
            <span>Import failed: {(lastResult.errors as string[])?.join(', ')}</span>
          )}
        </div>
      )}

      {/* History */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold text-gray-800">Import History</h3>
          <button onClick={load} className="btn-secondary text-xs">Refresh</button>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-6 text-gray-400">Loading…</div>
          ) : history.length === 0 ? (
            <div className="p-6 text-gray-400">No imports yet. Run a sample data load or file import above.</div>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Adapter</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">OK</th>
                  <th className="text-right">Errors</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((job: ImportJob) => (
                  <tr key={job.id}>
                    <td className="text-gray-500 text-xs">{new Date(job.created_at).toLocaleString()}</td>
                    <td><span className="badge-gray">{job.source_type}</span></td>
                    <td className="text-gray-500">{job.adapter_type}</td>
                    <td>{statusBadge(job.status)}</td>
                    <td className="text-right">{job.records_total}</td>
                    <td className="text-right text-success-700">{job.records_ok}</td>
                    <td className="text-right text-danger-600">{job.records_error}</td>
                    <td className="text-gray-500">{job.triggered_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

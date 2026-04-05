import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import { ImportService, ImportJobRecord } from '../modules/imports/import.service';
import { detectFormat, formatLabel } from '../modules/imports/file-parser.service';
import { backupRequiredMessage } from '../modules/imports/backup.service';
import { fmtDateTime } from '../lib/date';

export default function ImportsPage() {
  const [history,    setHistory]    = useState<ImportJobRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    try {
      const h = await ImportService.getHistory();
      setHistory(h);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadHistory(); }, []);

  async function handlePickFile() {
    const { canceled, filePaths } = await ImportService.openFileDialog();
    if (canceled || !filePaths.length) return;

    const filePath = filePaths[0];
    const fmt      = detectFormat(filePath);

    if (fmt === 'unknown') {
      setError(`Unsupported file type: ${filePath.split('.').pop()}`);
      return;
    }

    setError(null);
    setResult(null);
    setImporting(true);

    try {
      const summary = await ImportService.importFromFile(filePath, fmt);
      setResult(
        `Import complete. ${summary.recordsOk} OK, ${summary.recordsSkipped} skipped, ` +
        `${summary.recordsError} errors.`
      );
      await loadHistory();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleMockImport() {
    setError(null);
    setResult(null);
    setImporting(true);
    try {
      const summary = await ImportService.runMockImport();
      setResult(
        `Mock import complete. ${summary.recordsOk} OK, ${summary.recordsSkipped} skipped, ` +
        `${summary.recordsError} errors.`
      );
      await loadHistory();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Data Imports"
        subtitle="Import PLU data from POS exports"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={handleMockImport} disabled={importing}>
              Mock Import
            </button>
            <button className="btn-primary" onClick={handlePickFile} disabled={importing}>
              {importing ? 'Importing…' : 'Import File…'}
            </button>
          </div>
        }
      />

      {/* Backup notice */}
      <div className="rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs px-4 py-3 mb-6">
        {backupRequiredMessage('importing data')}
      </div>

      {/* Result / error banner */}
      {result && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 mb-4">
          {result}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* History table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Import History</h2>
        </div>

        {loading ? (
          <div className="p-6 animate-pulse space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        ) : history.length === 0 ? (
          <EmptyState title="No imports yet" description="Import a file to see history here." />
        ) : (
          <table className="table-base w-full">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Source</th>
                <th className="text-left">Adapter</th>
                <th className="text-right">Total</th>
                <th className="text-right">OK</th>
                <th className="text-right">Skipped</th>
                <th className="text-right">Errors</th>
                <th className="text-left">Status</th>
                <th className="text-left">By</th>
              </tr>
            </thead>
            <tbody>
              {history.map(job => (
                <tr key={job.id}>
                  <td className="text-xs">{fmtDateTime(job.created_at)}</td>
                  <td className="text-xs">{job.source_type}</td>
                  <td className="text-xs">{job.adapter_type}</td>
                  <td className="text-right tabular-nums">{job.records_total}</td>
                  <td className="text-right tabular-nums text-green-700">{job.records_ok}</td>
                  <td className="text-right tabular-nums text-yellow-700">{job.records_skipped}</td>
                  <td className="text-right tabular-nums text-red-600">{job.records_error}</td>
                  <td><StatusBadge label={job.status} status={job.status} /></td>
                  <td className="text-xs text-gray-500">{job.triggered_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

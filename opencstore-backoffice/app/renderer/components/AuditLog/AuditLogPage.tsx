import React, { useEffect, useState } from 'react';

interface AuditEntry {
  id: string;
  event_type: string;
  event_subtype: string | null;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  result: string;
  user_name: string | null;
  created_at: string;
  error_detail: string | null;
}

function resultBadge(r: string) {
  if (r === 'success') return <span className="badge-green">Success</span>;
  if (r === 'failure') return <span className="badge-red">Failure</span>;
  return <span className="badge-yellow">{r}</span>;
}

const EVENT_COLORS: Record<string, string> = {
  auth:           'text-blue-600',
  import:         'text-purple-600',
  audit:          'text-orange-600',
  pricing:        'text-green-600',
  recommendation: 'text-yellow-700',
  report:         'text-indigo-600',
  checklist:      'text-teal-600',
  onboarding:     'text-gray-600',
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [page, setPage]       = useState(0);
  const PAGE_SIZE = 50;

  const load = () => {
    window.electronAPI.getAuditLog({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }).then(e => {
      setEntries(e as AuditEntry[]);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [page]);

  const uniqueTypes = [...new Set(entries.map(e => e.event_type))].sort();
  const displayed = filterType ? entries.filter(e => e.event_type === filterType) : entries;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">Append-only record of all important actions</p>
        </div>
        <button onClick={load} className="btn-secondary text-xs">Refresh</button>
      </div>

      <div className="alert-info mb-5 text-xs">
        The audit log records every significant action: logins, imports, approvals, report generation, and checklist completions.
        Records are never deleted or modified.
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setFilterType('')}
          className={`px-3 py-1 rounded-full text-xs font-medium border ${!filterType ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          All
        </button>
        {uniqueTypes.map(t => (
          <button key={t} onClick={() => setFilterType(t === filterType ? '' : t)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${filterType === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="p-6 text-gray-400">Loading…</div>
          ) : displayed.length === 0 ? (
            <div className="p-6 text-gray-400">No audit entries found.</div>
          ) : (
            <>
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-40">Time</th>
                    <th>Event</th>
                    <th>Description</th>
                    <th>User</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((entry: AuditEntry) => (
                    <tr key={entry.id}>
                      <td className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td>
                        <div className={`text-xs font-mono font-semibold ${EVENT_COLORS[entry.event_type] ?? 'text-gray-600'}`}>
                          {entry.event_type}
                        </div>
                        {entry.event_subtype && (
                          <div className="text-xs text-gray-400">{entry.event_subtype}</div>
                        )}
                      </td>
                      <td className="text-sm text-gray-700 max-w-sm">
                        <div className="truncate" title={entry.description}>{entry.description}</div>
                        {entry.error_detail && (
                          <div className="text-xs text-danger-600 mt-0.5 truncate">{entry.error_detail}</div>
                        )}
                      </td>
                      <td className="text-gray-500 text-sm">{entry.user_name ?? '—'}</td>
                      <td>{resultBadge(entry.result)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <div className="text-xs text-gray-400">Showing {displayed.length} of {displayed.length} entries this page</div>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary text-xs">← Prev</button>
                  <span className="text-xs text-gray-500 self-center">Page {page + 1}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={entries.length < PAGE_SIZE} className="btn-secondary text-xs">Next →</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

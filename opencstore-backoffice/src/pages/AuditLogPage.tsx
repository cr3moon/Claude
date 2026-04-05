import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';
import { AuditService } from '../modules/audit/audit.service';
import { fmtDateTime } from '../lib/date';

interface AuditEntry {
  id:          string;
  action:      string;
  entity_type: string;
  entity_id:   string | null;
  user_name:   string | null;
  detail:      string | null;
  created_at:  string;
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit,   setLimit]   = useState(100);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await AuditService.getRecent(limit);
        setEntries(data as AuditEntry[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [limit]);

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only record of all system actions"
        actions={
          <select
            className="input text-xs"
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={500}>Last 500</option>
          </select>
        }
      />

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 animate-pulse space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-gray-100 rounded" />)}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState title="No audit entries" description="Actions will appear here as they occur." />
        ) : (
          <table className="table-base w-full text-xs">
            <thead>
              <tr>
                <th className="text-left">Timestamp</th>
                <th className="text-left">Action</th>
                <th className="text-left">Entity</th>
                <th className="text-left">User</th>
                <th className="text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap font-mono">{fmtDateTime(entry.created_at)}</td>
                  <td>
                    <StatusBadge
                      label={entry.action}
                      variant={
                        entry.action.includes('delete') ? 'red' :
                        entry.action.includes('create') ? 'green' :
                        entry.action.includes('update') ? 'blue' : 'gray'
                      }
                    />
                  </td>
                  <td>
                    <span className="font-medium">{entry.entity_type}</span>
                    {entry.entity_id && (
                      <span className="text-gray-400 ml-1 font-mono">#{entry.entity_id.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="text-gray-500">{entry.user_name ?? '—'}</td>
                  <td className="text-gray-500 max-w-xs truncate">{entry.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

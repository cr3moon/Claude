import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { ItemAuditService, type ItemRecommendation } from '../modules/items/item-audit.service';

export default function ItemAuditPage() {
  const [items,   setItems]   = useState<ItemRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState<{ action: 'approve' | 'reject'; id: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await ItemAuditService.getPending();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function runAudit() {
    setRunning(true);
    try {
      await ItemAuditService.runAudit();
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    if (confirm.action === 'approve') await ItemAuditService.approve(confirm.id);
    else await ItemAuditService.reject(confirm.id);
    setConfirm(null);
    await load();
  }

  const pending = items.filter(i => i.status === 'pending');

  return (
    <>
      <PageHeader
        title="Item Audit"
        subtitle={`${pending.length} pending recommendations`}
        actions={
          <button
            className="btn-primary"
            onClick={runAudit}
            disabled={running}
          >
            {running ? 'Running…' : 'Run Audit'}
          </button>
        }
      />

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No audit recommendations"
          description="Run an audit to check for data quality issues in your PLU items."
          icon="✓"
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table-base w-full">
            <thead>
              <tr>
                <th className="text-left">PLU</th>
                <th className="text-left">Description</th>
                <th className="text-left">Rule</th>
                <th className="text-left">Severity</th>
                <th className="text-left">Suggestion</th>
                <th className="text-left">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td className="font-mono text-xs">{item.pos_plu_id}</td>
                  <td className="max-w-[160px] truncate">{item.description}</td>
                  <td><code className="text-xs">{item.rule_code}</code></td>
                  <td>
                    <StatusBadge
                      label={item.requires_manual_review ? 'error' : 'warning'}
                      status={item.requires_manual_review ? 'error' : 'warning'}
                    />
                  </td>
                  <td className="text-xs text-gray-500 max-w-[180px] truncate">{item.reason}</td>
                  <td><StatusBadge label={item.status} status={item.status} /></td>
                  <td className="text-right">
                    {item.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <button
                          className="text-xs text-green-700 hover:underline"
                          onClick={() => setConfirm({ action: 'approve', id: item.id })}
                        >
                          Approve
                        </button>
                        <button
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => setConfirm({ action: 'reject', id: item.id })}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.action === 'approve' ? 'Approve recommendation?' : 'Reject recommendation?'}
        message={
          confirm?.action === 'approve'
            ? 'This will mark the item as approved and apply the suggested change.'
            : 'This will dismiss the recommendation without making any changes.'
        }
        variant={confirm?.action === 'approve' ? 'info' : 'danger'}
        confirmLabel={confirm?.action === 'approve' ? 'Approve' : 'Reject'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

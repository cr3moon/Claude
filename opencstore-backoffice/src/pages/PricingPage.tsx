import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { PricingEngineService } from '../modules/pricing/pricing-engine.service';
import { fmtMoney, fmtPct } from '../lib/currency';

interface PricingRec {
  id:             string;
  pos_plu_id:     string;
  description:    string;
  dept_name:      string;
  current_price:  number;
  current_cost:   number;
  suggested_price: number;
  current_margin: number;
  target_margin:  number;
  status:         string;
}

export default function PricingPage() {
  const [recs,    setRecs]    = useState<PricingRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await PricingEngineService.getPending();
      setRecs(data as PricingRec[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function runEngine() {
    setRunning(true);
    try {
      await PricingEngineService.runAnalysis();
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function applyApproved() {
    setApplyOpen(false);
    await PricingEngineService.exportApproved();
    await load();
  }

  async function approve(id: string) {
    await PricingEngineService.approve(id);
    setRecs(r => r.map(x => x.id === id ? { ...x, status: 'approved' } : x));
  }

  async function reject(id: string) {
    await PricingEngineService.reject(id);
    setRecs(r => r.map(x => x.id === id ? { ...x, status: 'rejected' } : x));
  }

  const approvedCount = recs.filter(r => r.status === 'approved').length;

  return (
    <>
      <PageHeader
        title="Pricing Recommendations"
        subtitle={`${recs.filter(r => r.status === 'pending').length} pending`}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={runEngine} disabled={running}>
              {running ? 'Running…' : 'Run Engine'}
            </button>
            {approvedCount > 0 && (
              <button className="btn-primary" onClick={() => setApplyOpen(true)}>
                Apply {approvedCount} Approved
              </button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
        </div>
      ) : recs.length === 0 ? (
        <EmptyState
          title="No pricing recommendations"
          description="Run the pricing engine to generate margin-based suggestions."
          icon="$"
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table-base w-full">
            <thead>
              <tr>
                <th className="text-left">PLU</th>
                <th className="text-left">Description</th>
                <th className="text-left">Dept</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Current</th>
                <th className="text-right">Suggested</th>
                <th className="text-right">Margin Now</th>
                <th className="text-right">Target</th>
                <th className="text-left">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recs.map(rec => (
                <tr key={rec.id}>
                  <td className="font-mono text-xs">{rec.pos_plu_id}</td>
                  <td className="max-w-[140px] truncate text-xs">{rec.description}</td>
                  <td className="text-xs text-gray-500">{rec.dept_name}</td>
                  <td className="text-right tabular-nums">{fmtMoney(rec.current_cost)}</td>
                  <td className="text-right tabular-nums">{fmtMoney(rec.current_price)}</td>
                  <td className="text-right tabular-nums font-semibold text-blue-700">
                    {fmtMoney(rec.suggested_price)}
                  </td>
                  <td className="text-right tabular-nums">{fmtPct(rec.current_margin)}</td>
                  <td className="text-right tabular-nums text-gray-400">{fmtPct(rec.target_margin)}</td>
                  <td><StatusBadge label={rec.status} status={rec.status} /></td>
                  <td className="text-right">
                    {rec.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <button className="text-xs text-green-700 hover:underline" onClick={() => approve(rec.id)}>
                          Approve
                        </button>
                        <button className="text-xs text-red-600 hover:underline" onClick={() => reject(rec.id)}>
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
        open={applyOpen}
        title="Apply approved price changes?"
        message={`This will write ${approvedCount} price change(s) to the price change history and queue them for POS export. A backup will be created first.`}
        variant="warning"
        confirmLabel="Apply Changes"
        onConfirm={applyApproved}
        onCancel={() => setApplyOpen(false)}
      />
    </>
  );
}

import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import { fmtMoney } from '../lib/currency';
import { fmtDateTime } from '../lib/date';

interface DashboardMetrics {
  totalSkus:          number;
  pendingAuditItems:  number;
  pendingPriceChanges: number;
  lastImportAt:       string | null;
  lastImportStatus:   string | null;
  openShifts:         number;
}

interface RecentAuditItem {
  id:          string;
  pos_plu_id:  string;
  description: string;
  rule_code:   string;
  created_at:  string;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recent,  setRecent]  = useState<RecentAuditItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [m, r] = await Promise.all([
          window.electronAPI.getDashboardMetrics?.() as Promise<DashboardMetrics>,
          window.electronAPI.getRecentAuditItems?.() as Promise<RecentAuditItem[]>,
        ]);
        setMetrics(m ?? null);
        setRecent(r ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Store overview" />

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total SKUs"
          value={loading ? '…' : (metrics?.totalSkus ?? 0).toLocaleString()}
          loading={loading}
        />
        <MetricCard
          label="Pending Audit"
          value={loading ? '…' : (metrics?.pendingAuditItems ?? 0)}
          sub="items needing review"
          loading={loading}
        />
        <MetricCard
          label="Pending Price Changes"
          value={loading ? '…' : (metrics?.pendingPriceChanges ?? 0)}
          sub="recommendations"
          loading={loading}
        />
        <MetricCard
          label="Open Shifts"
          value={loading ? '…' : (metrics?.openShifts ?? 0)}
          loading={loading}
        />
      </div>

      {/* Recent import status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Last Import</h2>
          {loading ? (
            <div className="animate-pulse h-8 bg-gray-100 rounded" />
          ) : metrics?.lastImportAt ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{fmtDateTime(metrics.lastImportAt)}</span>
              <StatusBadge
                label={metrics.lastImportStatus ?? 'unknown'}
                status={metrics.lastImportStatus ?? 'unknown'}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400">No imports yet.</p>
          )}
        </div>

        {/* Recent audit recommendations */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Audit Flags</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-6 bg-gray-100 rounded" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-gray-400">No recent flags.</p>
          ) : (
            <ul className="space-y-2">
              {recent.slice(0, 5).map(item => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate max-w-[60%]">
                    {item.pos_plu_id} — {item.description}
                  </span>
                  <StatusBadge label={item.rule_code} variant="yellow" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

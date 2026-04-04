import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface DashboardData {
  today_sales: number;
  pending_item_recommendations: number;
  pending_pricing_recommendations: number;
  last_import_at: string | null;
  last_backup_at: string | null;
  top_departments_today: { department: string; sales: number }[];
  low_margin_items: { pos_plu_id: string; description: string; margin_pct: number; retail_price: number; cost: number }[];
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return 'Never';
  return new Date(s).toLocaleString();
}

function timeSince(s: string | null) {
  if (!s) return 'Never';
  const diff = Date.now() - new Date(s).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2)  return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)   return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Dashboard() {
  const [data, setData]     = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    window.electronAPI.getDashboardSummary().then(d => {
      setData(d as DashboardData);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-gray-500">Loading dashboard…</div>;
  if (!data)   return <div className="alert-error">Failed to load dashboard.</div>;

  const hasPendingItems   = data.pending_item_recommendations > 0;
  const hasPendingPrices  = data.pending_pricing_recommendations > 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="btn-secondary text-xs"
        >
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-label">Today's Sales</div>
          <div className="stat-value text-brand-700">{fmtCurrency(data.today_sales)}</div>
        </div>

        <div className={`stat-card ${hasPendingItems ? 'border-warning-500 border-2' : ''}`}>
          <div className="stat-label">Item Audit Pending</div>
          <div className={`stat-value ${hasPendingItems ? 'text-warning-700' : 'text-gray-400'}`}>
            {data.pending_item_recommendations}
          </div>
          {hasPendingItems && (
            <button className="text-xs text-brand-600 hover:underline mt-1" onClick={() => navigate('/item-audit')}>
              Review now →
            </button>
          )}
        </div>

        <div className={`stat-card ${hasPendingPrices ? 'border-warning-500 border-2' : ''}`}>
          <div className="stat-label">Pricing Pending</div>
          <div className={`stat-value ${hasPendingPrices ? 'text-warning-700' : 'text-gray-400'}`}>
            {data.pending_pricing_recommendations}
          </div>
          {hasPendingPrices && (
            <button className="text-xs text-brand-600 hover:underline mt-1" onClick={() => navigate('/pricing')}>
              Review now →
            </button>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-label">Last Backup</div>
          <div className="text-base font-semibold text-gray-700">{timeSince(data.last_backup_at)}</div>
          <div className="text-xs text-gray-400">{fmtDate(data.last_backup_at)}</div>
        </div>
      </div>

      {/* Alerts */}
      {(hasPendingItems || hasPendingPrices || !data.last_import_at) && (
        <div className="mb-6 space-y-2">
          {!data.last_import_at && (
            <div className="alert-warning flex items-center justify-between">
              <span>No data has been imported yet. Load sample data or import your POS export files to get started.</span>
              <button className="btn-secondary text-xs ml-4" onClick={() => navigate('/imports')}>
                Go to Import
              </button>
            </div>
          )}
          {hasPendingItems && (
            <div className="alert-warning flex items-center justify-between">
              <span>{data.pending_item_recommendations} item quality recommendations are awaiting your review.</span>
              <button className="btn-secondary text-xs ml-4" onClick={() => navigate('/item-audit')}>
                Review
              </button>
            </div>
          )}
          {hasPendingPrices && (
            <div className="alert-warning flex items-center justify-between">
              <span>{data.pending_pricing_recommendations} pricing recommendations are awaiting approval.</span>
              <button className="btn-secondary text-xs ml-4" onClick={() => navigate('/pricing')}>
                Review
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Top departments today */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-800">Top Departments – Today</h3>
          </div>
          <div className="card-body">
            {data.top_departments_today.length === 0 ? (
              <div className="text-gray-400 text-sm">No sales data for today yet.</div>
            ) : (
              <div className="space-y-3">
                {data.top_departments_today.map((d, i) => (
                  <div key={d.department ?? i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-brand-400" />
                      <span className="text-sm text-gray-700">{d.department ?? 'Unassigned'}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{fmtCurrency(d.sales)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low margin items */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-800">Low Margin Items</h3>
            <button className="text-xs text-brand-600 hover:underline" onClick={() => navigate('/pricing')}>
              View all →
            </button>
          </div>
          <div className="card-body">
            {data.low_margin_items.length === 0 ? (
              <div className="text-gray-400 text-sm">No low-margin items detected. Import data first.</div>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Margin</th>
                    <th className="text-right">Retail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.low_margin_items.map((item: { pos_plu_id: string; description: string; margin_pct: number; retail_price: number }) => (
                    <tr key={item.pos_plu_id}>
                      <td className="max-w-[180px] truncate" title={item.description}>{item.description || item.pos_plu_id}</td>
                      <td className="text-right">
                        <span className={`badge ${item.margin_pct < 10 ? 'badge-red' : 'badge-yellow'}`}>
                          {item.margin_pct?.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-right text-gray-700">{fmtCurrency(item.retail_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Run Item Audit', icon: '🔍', to: '/item-audit' },
            { label: 'Pricing Analysis', icon: '💲', to: '/pricing' },
            { label: 'Daily Report', icon: '📄', to: '/reports' },
            { label: 'Shift Close', icon: '✅', to: '/operations' },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.to)}
              className="card p-4 text-left hover:border-brand-300 hover:bg-brand-50 transition-colors"
            >
              <div className="text-2xl mb-2">{a.icon}</div>
              <div className="text-sm font-medium text-gray-700">{a.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

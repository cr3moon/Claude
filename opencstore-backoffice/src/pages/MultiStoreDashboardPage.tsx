import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import { fmtMoney } from '../lib/currency';
import { StoreAccessService, type MultiStoreSummaryRow } from '../modules/stores/store-access.service';

export default function MultiStoreDashboardPage() {
  const [rows, setRows] = useState<MultiStoreSummaryRow[] | null>(null);

  useEffect(() => {
    (async () => {
      setRows(await StoreAccessService.getMultiStoreSummary());
    })();
  }, []);

  return (
    <>
      <PageHeader title="All Locations" subtitle="Side-by-side snapshot of every store you have access to" />

      {!rows ? (
        <div className="animate-pulse space-y-4">{[1, 2].map(i => <div key={i} className="h-32 bg-gray-100 rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No locations found" description="Something's wrong — you should always have at least your home store." icon="⬒" />
      ) : (
        <div className="space-y-6">
          {rows.map(row => (
            <div key={row.storeId} className="card">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-800">{row.name}</h2>
                {row.isHome && <StatusBadge label="Home" variant="blue" />}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Today's Sales" value={fmtMoney(row.dashboard.today_sales)} />
                <MetricCard label="Pending Item Recs" value={row.dashboard.pending_item_recommendations} />
                <MetricCard label="Pending Price Recs" value={row.dashboard.pending_pricing_recommendations} />
                <MetricCard label="Low Margin Items" value={row.dashboard.low_margin_items?.length ?? 0} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

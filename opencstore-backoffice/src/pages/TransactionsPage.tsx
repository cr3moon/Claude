import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import { fmtMoney } from '../lib/currency';
import { fmtDateTime } from '../lib/date';
import { TransactionsService, type Transaction } from '../modules/transactions/transactions.service';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tendersFromSourceRaw(sourceRaw: string | null): string {
  if (!sourceRaw) return '—';
  try {
    const parsed = JSON.parse(sourceRaw) as { tenders?: Array<{ mop: string; amount: number }> };
    if (!parsed.tenders?.length) return '—';
    return parsed.tenders.map((t) => `${t.mop} ${fmtMoney(t.amount)}`).join(', ');
  } catch {
    return '—';
  }
}

export default function TransactionsPage() {
  const [date, setDate] = useState(todayIso());
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setTransactions(await TransactionsService.listForDate(date));
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [date]);

  async function handleImport() {
    setError(null);
    setResult(null);
    setImporting(true);
    try {
      const summary = await TransactionsService.importDaily(date);
      setResult(
        `Imported ${summary.imported} new ticket(s) from period ${summary.periodFilename} ` +
        `(${summary.alreadyImported} already had been, ${summary.voidCount} void(s) not itemized).`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const dayTotal = transactions?.reduce((sum, t) => sum + t.total, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Live sales tickets pulled from Commander's T-Log"
        actions={
          <div className="flex items-center gap-2">
            <input type="date" className="input" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            <button className="btn-primary disabled:opacity-50" disabled={importing} onClick={handleImport}>
              {importing ? 'Importing…' : 'Import from Commander'}
            </button>
          </div>
        }
      />

      <div className="rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs px-4 py-3 mb-6">
        This surface (Commander's `vtransset`) is the least-verified integration in this app —
        treat imported totals as provisional until cross-checked against a real unit's numbers
        (e.g. the Daily Reconciliation card on the Dashboard).
      </div>

      {result && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 mb-4">{result}</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">{error}</div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">{date}</h2>
          {transactions && transactions.length > 0 && (
            <span className="text-xs text-gray-500">{transactions.length} ticket(s) · {fmtMoney(dayTotal)} total</span>
          )}
        </div>

        {loading || !transactions ? (
          <div className="p-6 animate-pulse space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            title="No transactions for this date"
            description={'Click "Import from Commander" to pull this day\'s closed T-Log.'}
          />
        ) : (
          <table className="table-base w-full">
            <thead>
              <tr>
                <th className="text-left">Time</th>
                <th className="text-left">Ticket</th>
                <th className="text-right">Subtotal</th>
                <th className="text-right">Tax</th>
                <th className="text-right">Total</th>
                <th className="text-left">Tender</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <React.Fragment key={txn.id}>
                  <tr>
                    <td className="text-xs">{fmtDateTime(txn.txn_at)}</td>
                    <td className="text-xs">{txn.pos_txn_id}</td>
                    <td className="text-right tabular-nums">{fmtMoney(txn.subtotal)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(txn.tax_total)}</td>
                    <td className="text-right tabular-nums font-medium">{fmtMoney(txn.total)}</td>
                    <td className="text-xs">{tendersFromSourceRaw(txn.source_raw)}</td>
                    <td className="text-right">
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => toggleExpanded(txn.id)}>
                        {expanded.has(txn.id) ? 'Hide' : 'Lines'}
                      </button>
                    </td>
                  </tr>
                  {expanded.has(txn.id) && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50 px-4 py-2">
                        {txn.items.length === 0 ? (
                          <p className="text-xs text-gray-400">No line items.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left">Description</th>
                                <th className="text-left">UPC</th>
                                <th className="text-right">Qty</th>
                                <th className="text-right">Ext Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {txn.items.map((item) => (
                                <tr key={item.id}>
                                  <td>{item.description || '—'}{item.is_fuel ? ' (fuel)' : ''}</td>
                                  <td>{item.pos_plu_id || '—'}</td>
                                  <td className="text-right tabular-nums">{item.quantity}</td>
                                  <td className="text-right tabular-nums">{fmtMoney(item.ext_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

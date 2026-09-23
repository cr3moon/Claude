import React, { useEffect, useState } from 'react';
import { ReconciliationService, type DailyReconciliation } from '../../modules/reconciliation/reconciliation.service';
import { fmtMoney } from '../../lib/currency';
import { fmtDateTime } from '../../lib/date';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ShiftChecklistRow {
  id: string;
  checklist_type: string;
  started_at: string;
  over_short_amount: number;
  operator_name: string;
}

function varianceColor(v: number): string {
  if (Math.abs(v) < 0.01) return 'text-gray-400';
  return v > 0 ? 'text-green-600' : 'text-red-600';
}

export default function ReconciliationCard() {
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState<DailyReconciliation | null>(null);
  const [shiftChecklists, setShiftChecklists] = useState<ShiftChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [recon, checklists] = await Promise.all([
        ReconciliationService.getDailyReconciliation(date),
        window.electronAPI.getChecklistHistory(),
      ]);
      setData(recon);
      setShiftChecklists(
        (checklists as ShiftChecklistRow[]).filter(
          (c) => c.checklist_type === 'shift_close' && c.started_at.slice(0, 10) === date
        )
      );
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [date]);

  async function pullReport() {
    setPulling(true);
    setError(null);
    try {
      await Promise.all([
        ReconciliationService.captureDailyReport(date),
        ReconciliationService.captureShiftReports(date),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPulling(false);
    }
  }

  return (
    <div className="card mt-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Daily Reconciliation</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Compares manually-entered daily sales and shift figures against the same period pulled
            directly from Commander's own reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date" className="input" value={date} max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="btn-secondary text-xs disabled:opacity-50" disabled={pulling} onClick={pullReport}>
            {pulling ? 'Pulling…' : 'Pull Commander Report'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading || !data ? (
        <div className="animate-pulse h-24 bg-gray-100 rounded-lg" />
      ) : !data.hasCommanderData ? (
        <p className="text-xs text-gray-400">
          No Commander report pulled for this date yet. Once connected (Settings → Fuel POS
          Connection), click "Pull Commander Report" — this only works once the matching DAILY
          period exists on Commander (today's "current" period, or a later closed one).
        </p>
      ) : (
        <>
          {data.departmentVariance.length > 0 && (
            <table className="table-base w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left">Department</th>
                  <th className="text-right">Manual</th>
                  <th className="text-right">Commander</th>
                  <th className="text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.departmentVariance.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="text-right tabular-nums">{fmtMoney(row.manual)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(row.commander)}</td>
                    <td className={`text-right tabular-nums ${varianceColor(row.variance)}`}>
                      {row.variance > 0 ? '+' : ''}{fmtMoney(row.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {data.dailySnapshot && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500">Fuel Sales (Commander)</p>
                <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtMoney(data.dailySnapshot.fuel_sales)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">HIGH TAX collected</p>
                <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtMoney(data.dailySnapshot.high_tax_net)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">LOW TAX collected</p>
                <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtMoney(data.dailySnapshot.low_tax_net)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Commander period</p>
                <p className="text-sm font-semibold text-gray-900">{data.dailySnapshot.period_filename}</p>
              </div>
            </div>
          )}

          {(data.shiftSnapshots.length > 0 || shiftChecklists.length > 0) && (
            <div className="pt-3 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">Shifts this day</h3>

              {data.shiftSnapshots.length > 0 && (
                <table className="table-base w-full text-xs mb-2">
                  <thead>
                    <tr>
                      <th className="text-left">Commander Period</th>
                      <th className="text-right">Cash</th>
                      <th className="text-right">Credit</th>
                      <th className="text-right">Debit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shiftSnapshots.map((s) => (
                      <tr key={s.id}>
                        <td>{s.period_filename}</td>
                        <td className="text-right tabular-nums">{fmtMoney(s.cash_tender)}</td>
                        <td className="text-right tabular-nums">{fmtMoney(s.credit_tender)}</td>
                        <td className="text-right tabular-nums">{fmtMoney(s.debit_tender)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {shiftChecklists.length > 0 && (
                <div className="text-xs text-gray-600 space-y-1">
                  <p className="font-medium text-gray-700">Shift-close over/short (entered manually):</p>
                  {shiftChecklists.map((c) => (
                    <div key={c.id} className="flex justify-between">
                      <span>{c.operator_name} — {fmtDateTime(c.started_at)}</span>
                      <span className={c.over_short_amount === 0 ? '' : varianceColor(c.over_short_amount)}>
                        {fmtMoney(c.over_short_amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

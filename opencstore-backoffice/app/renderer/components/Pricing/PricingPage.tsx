import React, { useEffect, useState } from 'react';

interface PriceRec {
  id: string;
  plu_item_id: string;
  pos_plu_id: string;
  description: string;
  dept_name: string;
  current_retail: number;
  current_cost: number | null;
  current_margin_pct: number | null;
  recommended_retail: number;
  estimated_margin_pct: number | null;
  reason: string;
  rule_code: string;
  confidence: number;
  status: string;
}

const RULE_LABELS: Record<string, string> = {
  MARGIN_BELOW_TARGET:   'Below Target Margin',
  COST_INCREASE:         'Cost Increase',
  BAD_PRICE_ENDING:      'Non-standard Ending',
  LOW_VOLUME_LOW_MARGIN: 'Low Volume + Low Margin',
  PRICE_BELOW_COST:      'Price Below Cost',
  ZERO_MARGIN:           'Zero Margin',
};

function fmt(n: number | null) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function pct(n: number | null) {
  if (n === null || n === undefined) return '—';
  return n.toFixed(1) + '%';
}

function marginBadge(pctVal: number | null) {
  if (pctVal === null) return <span className="badge-gray">—</span>;
  if (pctVal < 10)  return <span className="badge-red">{pctVal.toFixed(1)}%</span>;
  if (pctVal < 20)  return <span className="badge-yellow">{pctVal.toFixed(1)}%</span>;
  return <span className="badge-green">{pctVal.toFixed(1)}%</span>;
}

export default function PricingPage() {
  const [recs, setRecs]       = useState<PriceRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null);
  const [filterRule, setFilterRule] = useState('');
  const [notes, setNotes]     = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<Record<string, unknown> | null>(null);

  const load = (jobRunId?: string) => {
    window.electronAPI.getPendingPriceRecs(jobRunId).then(r => {
      setRecs(r as PriceRec[]);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const runAnalysis = async () => {
    setRunning(true);
    setLastRun(null);
    const result = await window.electronAPI.runPricingAnalysis();
    setLastRun(result as Record<string, unknown>);
    setRunning(false);
    load((result as { jobRunId: string }).jobRunId);
  };

  const approve = async (id: string) => {
    setWorking(id);
    await window.electronAPI.approvePriceRec(id, notes[id]);
    setRecs(r => r.map(x => x.id === id ? { ...x, status: 'approved' } : x));
    setWorking(null);
  };

  const reject = async (id: string) => {
    setWorking(id);
    await window.electronAPI.rejectPriceRec(id, notes[id]);
    setRecs(r => r.filter(x => x.id !== id));
    setWorking(null);
  };

  const exportPrices = async () => {
    const approvedCount = recs.filter(r => r.status === 'approved').length;
    if (approvedCount === 0) { alert('No approved recommendations to export.'); return; }
    if (!window.confirm(`Export ${approvedCount} approved price changes? This will log a price-change record for each item.`)) return;
    setExporting(true);
    const result = await window.electronAPI.exportApprovedPrices();
    setExportResult(result as Record<string, unknown>);
    setExporting(false);
    load();
  };

  const uniqueRules = [...new Set(recs.map(r => r.rule_code))];
  const displayed   = filterRule ? recs.filter(r => r.rule_code === filterRule) : recs;
  const approvedCount = recs.filter(r => r.status === 'approved').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pricing</h1>
          <p className="page-subtitle">Margin-based pricing recommendations</p>
        </div>
        <div className="flex gap-2">
          {approvedCount > 0 && (
            <button onClick={exportPrices} className="btn-success" disabled={exporting}>
              {exporting ? 'Exporting…' : `Export ${approvedCount} Approved`}
            </button>
          )}
          <button onClick={runAnalysis} className="btn-primary" disabled={running}>
            {running ? '⏳ Analyzing…' : '💲 Run Pricing Analysis'}
          </button>
        </div>
      </div>

      <div className="alert-info mb-5 text-xs leading-relaxed">
        Pricing recommendations are based on configured margin targets by department and price-ending rules.
        Every recommendation includes an explanation. <strong>Approve recommendations you agree with, then click Export.</strong>
        No price changes are written to your POS until you export and manually import the export file.
      </div>

      {lastRun && (
        <div className="alert-success mb-4">
          Analysis complete — <strong>{lastRun.totalItems as number}</strong> items analyzed,{' '}
          <strong>{lastRun.totalRecommendations as number}</strong> recommendations generated.
        </div>
      )}

      {exportResult && (
        <div className={`mb-4 ${exportResult.success ? 'alert-success' : 'alert-error'}`}>
          {exportResult.success
            ? `✓ ${exportResult.count as number} price changes exported to: ${exportResult.exportPath as string}`
            : `Export failed: ${exportResult.error as string}`}
        </div>
      )}

      {/* Rule filter chips */}
      {recs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={() => setFilterRule('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${!filterRule ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            All ({recs.length})
          </button>
          {uniqueRules.map(code => (
            <button key={code} onClick={() => setFilterRule(code === filterRule ? '' : code)}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${filterRule === code ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {RULE_LABELS[code] ?? code} ({recs.filter(r => r.rule_code === code).length})
            </button>
          ))}
        </div>
      )}

      {/* Recommendations table */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold text-gray-800">Recommendations ({displayed.length})</h3>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-6 text-gray-400">Loading…</div>
          ) : displayed.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              No pending recommendations. Run the pricing analysis to get started.
            </div>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Dept</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">Current Retail</th>
                  <th className="text-right">Current Margin</th>
                  <th className="text-right">Suggested Retail</th>
                  <th className="text-right">Est. Margin</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((rec: PriceRec) => (
                  <tr key={rec.id} className={rec.status === 'approved' ? 'bg-green-50' : ''}>
                    <td>
                      <div className="font-medium text-gray-800 max-w-[180px] truncate" title={rec.description}>
                        {rec.description || rec.pos_plu_id}
                      </div>
                      <div className="text-xs text-gray-400">{rec.pos_plu_id}</div>
                    </td>
                    <td><span className="badge-gray text-xs">{rec.dept_name ?? '—'}</span></td>
                    <td className="text-right text-gray-600">{fmt(rec.current_cost)}</td>
                    <td className="text-right font-medium">{fmt(rec.current_retail)}</td>
                    <td className="text-right">{marginBadge(rec.current_margin_pct)}</td>
                    <td className="text-right font-semibold text-brand-700">{fmt(rec.recommended_retail)}</td>
                    <td className="text-right">{marginBadge(rec.estimated_margin_pct)}</td>
                    <td>
                      <div className="text-xs text-gray-600 max-w-[200px]">
                        <span className="badge-yellow mr-1">{RULE_LABELS[rec.rule_code] ?? rec.rule_code}</span>
                        <span title={rec.reason} className="cursor-help underline decoration-dotted">reason</span>
                        <div className="mt-1 hidden group-hover:block">{rec.reason}</div>
                      </div>
                    </td>
                    <td>
                      {rec.status === 'approved' ? (
                        <span className="badge-green">Approved</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1">
                            <button onClick={() => approve(rec.id)} className="btn-success text-xs px-2 py-1" disabled={working === rec.id}>✓</button>
                            <button onClick={() => reject(rec.id)}  className="btn-danger  text-xs px-2 py-1" disabled={working === rec.id}>✗</button>
                          </div>
                          <input
                            type="text"
                            className="input text-xs w-28"
                            placeholder="Note…"
                            value={notes[rec.id] ?? ''}
                            onChange={e => setNotes(n => ({ ...n, [rec.id]: e.target.value }))}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-4 alert-warning text-xs">
        <strong>Write-back notice:</strong> After exporting, you must manually import the generated file into your POS
        back-office software. A logout/login at the POS terminal may be required for price changes to take effect.
        Keep the export file as your audit record.
      </div>
    </div>
  );
}

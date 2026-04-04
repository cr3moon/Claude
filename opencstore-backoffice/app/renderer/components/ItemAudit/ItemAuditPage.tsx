import React, { useEffect, useState } from 'react';

interface ItemRec {
  id: string;
  plu_item_id: string;
  pos_plu_id: string;
  description: string;
  dept_name: string;
  field_name: string;
  current_value: string | null;
  recommended_value: string | null;
  reason: string;
  rule_code: string;
  confidence: number;
  requires_manual_review: number;
  status: string;
}

const RULE_LABELS: Record<string, string> = {
  BLANK_DESC:       'Blank Description',
  BLANK_SHORT_DESC: 'Missing Short Desc',
  DUPLICATE_UPC:    'Duplicate Barcode',
  DUPLICATE_DESC:   'Duplicate Description',
  MISSING_UPC:      'Missing Barcode',
  MISSING_DEPT:     'No Department',
  MISSING_CATEGORY: 'No Category',
  INCONSISTENT_UOM: 'Inconsistent UOM',
  WRONG_TAX_TOBACCO:'Wrong Tax Flag',
  WRONG_AGE_TOBACCO:'Missing Age Flag',
  WRONG_AGE_ALCOHOL:'Missing Age Flag',
  WRONG_DEPT_ENERGY:'Wrong Department',
  BAD_UPC_LENGTH:   'Bad Barcode Length',
  ABBREV_TOO_LONG:  'Short Desc Too Long',
  NO_COST:          'No Cost',
  NO_PRICE:         'No Retail Price',
  PRICE_BELOW_COST: 'Price Below Cost',
};

function confidenceBadge(n: number) {
  if (n >= 0.9) return <span className="badge-red">High</span>;
  if (n >= 0.7) return <span className="badge-yellow">Medium</span>;
  return <span className="badge-gray">Low</span>;
}

export default function ItemAuditPage() {
  const [recs, setRecs]         = useState<ItemRec[]>([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  const [lastRun, setLastRun]   = useState<Record<string, unknown> | null>(null);
  const [filterRule, setFilterRule] = useState('');
  const [notes, setNotes]       = useState<Record<string, string>>({});
  const [working, setWorking]   = useState<string | null>(null);

  const load = (jobRunId?: string) => {
    window.electronAPI.getPendingItemRecs(jobRunId).then(r => {
      setRecs(r as ItemRec[]);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const runAudit = async () => {
    setRunning(true);
    const result = await window.electronAPI.runItemAudit();
    setLastRun(result as Record<string, unknown>);
    setRunning(false);
    load((result as { jobRunId: string }).jobRunId);
  };

  const approve = async (id: string) => {
    setWorking(id);
    await window.electronAPI.approveItemRec(id, notes[id]);
    setRecs(r => r.filter(x => x.id !== id));
    setWorking(null);
  };

  const reject = async (id: string) => {
    setWorking(id);
    await window.electronAPI.rejectItemRec(id, notes[id]);
    setRecs(r => r.filter(x => x.id !== id));
    setWorking(null);
  };

  const approveAll = async () => {
    if (!window.confirm(`Approve all ${displayed.length} recommendations? This cannot be undone.`)) return;
    for (const r of displayed) {
      await window.electronAPI.approveItemRec(r.id);
    }
    load();
  };

  const uniqueRules = [...new Set(recs.map(r => r.rule_code))].sort();
  const displayed = filterRule ? recs.filter(r => r.rule_code === filterRule) : recs;

  const ruleBreakdown = uniqueRules.reduce<Record<string, number>>((acc, code) => {
    acc[code] = recs.filter(r => r.rule_code === code).length;
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Item Audit</h1>
          <p className="page-subtitle">Review data quality issues in your PLU catalog</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runAudit} className="btn-primary" disabled={running}>
            {running ? '⏳ Analyzing…' : '🔍 Run Item Audit'}
          </button>
        </div>
      </div>

      <div className="alert-info mb-5 text-xs leading-relaxed">
        The item audit engine checks your PLU catalog for data quality issues: missing barcodes, blank descriptions,
        wrong tax/age flags, duplicate items, and more. Review each recommendation and approve or reject it.
        <strong> No changes are made to your POS until you explicitly approve and export them.</strong>
      </div>

      {/* Last run summary */}
      {lastRun && (
        <div className="alert-success mb-5">
          Audit complete — <strong>{lastRun.totalItems as number}</strong> items analyzed,{' '}
          <strong>{lastRun.totalRecommendations as number}</strong> recommendations generated.
        </div>
      )}

      {/* Rule breakdown chips */}
      {recs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setFilterRule('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!filterRule ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
          >
            All ({recs.length})
          </button>
          {uniqueRules.map(code => (
            <button
              key={code}
              onClick={() => setFilterRule(code === filterRule ? '' : code)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterRule === code ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
              {RULE_LABELS[code] ?? code} ({ruleBreakdown[code]})
            </button>
          ))}
        </div>
      )}

      {/* Recommendation list */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold text-gray-800">
            Pending Recommendations ({displayed.length})
          </h3>
          {displayed.length > 0 && (
            <button onClick={approveAll} className="btn-success text-xs">
              Approve All Shown
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-6 text-gray-400">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            {recs.length === 0
              ? 'No pending recommendations. Run the item audit to analyze your catalog.'
              : 'No recommendations match the selected filter.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayed.map((rec: ItemRec) => (
              <div key={rec.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-gray-900 text-sm truncate max-w-xs">
                        {rec.description || `PLU #${rec.pos_plu_id}`}
                      </span>
                      <span className="badge-gray">{rec.pos_plu_id}</span>
                      {rec.dept_name && <span className="badge-blue">{rec.dept_name}</span>}
                      <span className="badge-yellow">{RULE_LABELS[rec.rule_code] ?? rec.rule_code}</span>
                      {confidenceBadge(rec.confidence)}
                      {rec.requires_manual_review === 1 && <span className="badge-red">Manual Review</span>}
                    </div>

                    <p className="text-sm text-gray-600 mb-2">{rec.reason}</p>

                    {(rec.current_value !== null || rec.recommended_value !== null) && (
                      <div className="flex items-center gap-3 text-xs mt-1">
                        {rec.current_value !== null && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">Current:</span>
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                              {rec.current_value || '(empty)'}
                            </code>
                          </div>
                        )}
                        {rec.recommended_value !== null && (
                          <>
                            <span className="text-gray-300">→</span>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">Suggested:</span>
                              <code className="bg-success-50 text-success-700 px-1.5 py-0.5 rounded">
                                {rec.recommended_value}
                              </code>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex gap-2">
                      <button
                        onClick={() => approve(rec.id)}
                        className="btn-success text-xs"
                        disabled={working === rec.id}
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => reject(rec.id)}
                        className="btn-danger text-xs"
                        disabled={working === rec.id}
                      >
                        ✗ Reject
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Optional note…"
                      className="input text-xs w-40"
                      value={notes[rec.id] ?? ''}
                      onChange={e => setNotes(n => ({ ...n, [rec.id]: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {recs.length > 0 && (
        <div className="mt-4 alert-warning text-xs">
          <strong>After approving:</strong> Approved item changes are queued for export. You must go to Settings → Export Changes
          to generate an import file for your POS. The POS may require a reload or logout/login before changes appear.
        </div>
      )}
    </div>
  );
}

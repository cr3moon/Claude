import React, { useEffect, useState } from 'react';

const CHECKLIST_TYPES = [
  { value: 'shift_open',  label: 'Shift Open',  icon: '🌅' },
  { value: 'shift_close', label: 'Shift Close', icon: '🌆' },
  { value: 'day_close',   label: 'Day Close',   icon: '🌙' },
];

interface ChecklistStep {
  id: string;
  step_key: string;
  step_label: string;
  step_order: number;
  completed: number;
  completed_at: string | null;
  numeric_value: number | null;
  notes: string | null;
}

interface ChecklistData {
  checklist: {
    id: string;
    checklist_type: string;
    operator_name: string;
    operator_initials: string;
    started_at: string;
    completed_at: string | null;
    is_complete: number;
    over_short_amount: number;
    manager_notes: string | null;
  };
  steps: ChecklistStep[];
}

interface HistoryItem {
  id: string;
  checklist_type: string;
  operator_name: string;
  started_at: string;
  completed_at: string | null;
  is_complete: number;
  over_short_amount: number;
}

export default function OperationsPage() {
  const [tab, setTab]           = useState<'new' | 'active' | 'history'>('new');
  const [type, setType]         = useState('shift_close');
  const [opName, setOpName]     = useState('');
  const [opInitials, setOpInitials] = useState('');
  const [creating, setCreating] = useState(false);
  const [active, setActive]     = useState<ChecklistData | null>(null);
  const [history, setHistory]   = useState<HistoryItem[]>([]);
  const [stepValues, setStepValues] = useState<Record<string, string>>({});
  const [stepNotes, setStepNotes]   = useState<Record<string, string>>({});
  const [overShort, setOverShort]   = useState('');
  const [managerNotes, setManagerNotes] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [done, setDone]         = useState(false);

  useEffect(() => {
    window.electronAPI.getChecklistHistory().then(h => setHistory(h as HistoryItem[]));
  }, []);

  const create = async () => {
    if (!opName.trim() || !opInitials.trim()) { alert('Enter operator name and initials.'); return; }
    setCreating(true);
    const result = await window.electronAPI.createChecklist({ checklistType: type, operatorName: opName, operatorInitials: opInitials });
    const data = await window.electronAPI.getChecklist((result as { id: string }).id);
    setActive(data as ChecklistData);
    setCreating(false);
    setTab('active');
  };

  const toggleStep = async (step: ChecklistStep) => {
    if (step.completed) return;
    const value = stepValues[step.id] ? Number(stepValues[step.id]) : undefined;
    const notes = stepNotes[step.id];
    await window.electronAPI.completeStep({ stepId: step.id, value, notes });
    const updated = await window.electronAPI.getChecklist(active!.checklist.id);
    setActive(updated as ChecklistData);
  };

  const finalize = async () => {
    if (!window.confirm('Mark this checklist as complete?')) return;
    setFinalizing(true);
    await window.electronAPI.finalizeChecklist({
      checklistId: active!.checklist.id,
      notes: managerNotes,
      overShort: overShort ? Number(overShort) : 0,
    });
    setDone(true);
    setFinalizing(false);
    window.electronAPI.getChecklistHistory().then(h => setHistory(h as HistoryItem[]));
  };

  const completedCount = active?.steps.filter(s => s.completed).length ?? 0;
  const totalCount     = active?.steps.length ?? 0;
  const allDone        = totalCount > 0 && completedCount === totalCount;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operations</h1>
          <p className="page-subtitle">Shift checklists and end-of-day procedures</p>
        </div>
        <div className="flex gap-2">
          {['new', 'active', 'history'].map(t => (
            <button key={t} onClick={() => setTab(t as typeof tab)}
              className={`btn-secondary text-xs capitalize ${tab === t ? 'bg-brand-50 border-brand-300' : ''}`}>
              {t === 'active' && active ? `Active (${completedCount}/${totalCount})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* New checklist */}
      {tab === 'new' && (
        <div className="max-w-md">
          <div className="card">
            <div className="card-header"><h3 className="font-semibold">Start a Checklist</h3></div>
            <div className="card-body space-y-4">
              <div>
                <label className="label">Checklist Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {CHECKLIST_TYPES.map(c => (
                    <button key={c.value} onClick={() => setType(c.value)}
                      className={`p-3 rounded-lg border text-center transition-colors ${type === c.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <div className="text-2xl">{c.icon}</div>
                      <div className="text-xs font-medium mt-1">{c.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="label">Operator Name</label>
                  <input className="input" value={opName} onChange={e => setOpName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="label">Initials</label>
                  <input className="input" value={opInitials} onChange={e => setOpInitials(e.target.value.toUpperCase())} placeholder="JS" maxLength={4} />
                </div>
              </div>
              <button onClick={create} className="btn-primary w-full justify-center" disabled={creating}>
                {creating ? 'Creating…' : 'Start Checklist'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active checklist */}
      {tab === 'active' && (
        <>
          {!active ? (
            <div className="text-gray-400">No active checklist. Start one from the "New" tab.</div>
          ) : done ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">✅</div>
              <div className="text-xl font-bold text-gray-800">Checklist Complete</div>
              <div className="text-gray-500 mt-1">{CHECKLIST_TYPES.find(c => c.value === active.checklist.checklist_type)?.label} signed off by {active.checklist.operator_name}</div>
              <button onClick={() => { setActive(null); setDone(false); setTab('new'); }} className="btn-primary mt-6">
                Start Another
              </button>
            </div>
          ) : (
            <div className="max-w-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-base font-semibold text-gray-800">
                    {CHECKLIST_TYPES.find(c => c.value === active.checklist.checklist_type)?.label}
                  </div>
                  <div className="text-sm text-gray-500">
                    {active.checklist.operator_name} ({active.checklist.operator_initials}) – {new Date(active.checklist.started_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-sm font-medium text-brand-700">
                  {completedCount} / {totalCount} steps
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
                <div className="bg-brand-500 h-2 rounded-full transition-all"
                  style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }} />
              </div>

              {/* Steps */}
              <div className="space-y-2 mb-6">
                {active.steps.map(step => (
                  <div key={step.id}
                    className={`card p-4 cursor-pointer transition-colors ${step.completed ? 'bg-success-50 border-green-200' : 'hover:bg-gray-50'}`}
                    onClick={() => !step.completed && toggleStep(step)}>
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
                        ${step.completed ? 'bg-success-500 border-success-500 text-white' : 'border-gray-300'}`}>
                        {step.completed && <span className="text-xs">✓</span>}
                      </div>
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${step.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {step.step_label}
                        </div>
                        {step.completed && step.completed_at && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            Completed {new Date(step.completed_at).toLocaleTimeString()}
                            {step.numeric_value !== null && ` – Amount: $${step.numeric_value.toFixed(2)}`}
                          </div>
                        )}
                        {!step.completed && (step.step_key.includes('cash') || step.step_key.includes('safe') || step.step_key.includes('drop') || step.step_key.includes('short')) && (
                          <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                            <input type="number" className="input text-xs w-32" placeholder="Amount $"
                              value={stepValues[step.id] ?? ''}
                              onChange={e => setStepValues(v => ({ ...v, [step.id]: e.target.value }))} />
                            <input type="text" className="input text-xs flex-1" placeholder="Notes…"
                              value={stepNotes[step.id] ?? ''}
                              onChange={e => setStepNotes(n => ({ ...n, [step.id]: e.target.value }))} />
                            <button className="btn-success text-xs" onClick={() => toggleStep(step)}>Done</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Finalize section */}
              {allDone && (
                <div className="card p-4 border-brand-200 bg-brand-50">
                  <h4 className="font-semibold text-gray-800 mb-3">Finalize & Sign Off</h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label">Over/Short Amount</label>
                      <input type="number" className="input" step="0.01" placeholder="0.00"
                        value={overShort} onChange={e => setOverShort(e.target.value)} />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="label">Manager Notes</label>
                    <textarea className="input resize-none h-20" value={managerNotes}
                      onChange={e => setManagerNotes(e.target.value)} placeholder="Any notes for the next shift or manager…" />
                  </div>
                  <button onClick={finalize} className="btn-primary w-full justify-center" disabled={finalizing}>
                    {finalizing ? 'Finalizing…' : '✅ Sign Off & Complete'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="card">
          <div className="card-header"><h3 className="font-semibold">Checklist History</h3></div>
          <div className="card-body p-0">
            {history.length === 0 ? (
              <div className="p-6 text-gray-400">No completed checklists yet.</div>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Operator</th>
                    <th>Over/Short</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item: HistoryItem) => (
                    <tr key={item.id}>
                      <td className="text-xs text-gray-500">{new Date(item.started_at).toLocaleString()}</td>
                      <td><span className="badge-blue">{item.checklist_type.replace('_', ' ')}</span></td>
                      <td>{item.operator_name}</td>
                      <td className={Number(item.over_short_amount) !== 0 ? 'text-danger-600 font-medium' : ''}>
                        {Number(item.over_short_amount) >= 0 ? '+' : ''}{Number(item.over_short_amount).toFixed(2)}
                      </td>
                      <td>{item.is_complete ? <span className="badge-green">Complete</span> : <span className="badge-yellow">In Progress</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

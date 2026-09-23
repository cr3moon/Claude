import React, { useEffect, useState } from 'react';
import { DashboardDataService } from '../../modules/dashboard/dashboard-data.service';

interface Department {
  id: string;
  name: string;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailySalesEntryDialog({ onClose, onSaved }: Props) {
  const [date, setDate] = useState(todayIso());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const depts = await window.electronAPI.getDepartments() as Department[];
      setDepartments(depts);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const existing = await DashboardDataService.getEntriesForDate(date);
      const next: Record<string, string> = {};
      for (const e of existing) next[e.department_id] = String(e.amount);
      setAmounts(next);
    })();
  }, [date]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(amounts).filter(([, v]) => v.trim() !== '');
      for (const [departmentId, value] of entries) {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error(`Enter a valid amount for each department (or leave it blank).`);
        }
        await DashboardDataService.upsertDailySalesEntry(date, departmentId, amount);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-3 max-h-[80vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-gray-900">Log Daily Sales</h2>
        <p className="text-xs text-gray-500">
          Enter each department's total sales for the day. This feeds the Department Sales and
          Merchandise Sales charts until a live POS feed is connected.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
          <input type="date" className="input w-full" value={date} max={todayIso()} onChange={e => setDate(e.target.value)} />
        </div>

        {departments.length === 0 ? (
          <p className="text-xs text-gray-400">No departments yet — import a pricebook first.</p>
        ) : (
          <div className="space-y-2">
            {departments.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3">
                <label className="text-sm text-gray-700 flex-1">{d.name}</label>
                <input
                  type="number" step="0.01" min="0" placeholder="0.00"
                  className="input w-28 text-right"
                  value={amounts[d.id] ?? ''}
                  onChange={e => setAmounts(a => ({ ...a, [d.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-white">
          <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary disabled:opacity-50" disabled={saving || departments.length === 0} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

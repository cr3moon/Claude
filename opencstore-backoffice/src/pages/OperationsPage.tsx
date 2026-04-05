import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import { OperationsService } from '../modules/operations/operations.service';
import { CHECKLIST_TEMPLATES, checklistLabel } from '../modules/operations/checklist-definitions';
import { fmtDateTime } from '../lib/date';

interface ShiftRecord {
  id:             string;
  cashier_name:   string;
  status:         string;
  opened_at:      string;
  closed_at:      string | null;
}

interface ChecklistRun {
  id:          string;
  template_id: string;
  status:      string;
  created_at:  string;
  steps_done:  number;
  steps_total: number;
}

export default function OperationsPage() {
  const [shifts,     setShifts]     = useState<ShiftRecord[]>([]);
  const [checklists, setChecklists] = useState<ChecklistRun[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [opening,    setOpening]    = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        OperationsService.getShifts(),
        OperationsService.getChecklists(),
      ]);
      setShifts(s as ShiftRecord[]);
      setChecklists(c as ChecklistRun[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openShift() {
    setOpening(true);
    try {
      await OperationsService.openShift();
      await load();
    } finally {
      setOpening(false);
    }
  }

  async function closeShift(id: string) {
    await OperationsService.closeShift(id);
    await load();
  }

  async function startChecklist(templateId: string) {
    await OperationsService.startChecklist(templateId);
    await load();
  }

  const openShifts = shifts.filter(s => s.status === 'open');

  return (
    <>
      <PageHeader
        title="Operations"
        subtitle="Shifts and daily checklists"
        actions={
          <button className="btn-primary" onClick={openShift} disabled={opening}>
            {opening ? 'Opening…' : 'Open Shift'}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shifts */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Active Shifts ({openShifts.length})
          </h2>

          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1,2].map(i => <div key={i} className="h-10 bg-gray-100 rounded" />)}
            </div>
          ) : openShifts.length === 0 ? (
            <EmptyState title="No open shifts" description="Open a shift to start tracking." />
          ) : (
            <div className="space-y-2">
              {openShifts.map(shift => (
                <div key={shift.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{shift.cashier_name}</p>
                    <p className="text-xs text-gray-400">Opened {fmtDateTime(shift.opened_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label="open" status="ok" />
                    <button
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => closeShift(shift.id)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checklists */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Checklists</h2>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {CHECKLIST_TEMPLATES.map(t => (
              <button
                key={t.id}
                className="btn-secondary text-xs"
                onClick={() => startChecklist(t.id)}
              >
                + {checklistLabel(t.id)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1,2].map(i => <div key={i} className="h-8 bg-gray-100 rounded" />)}
            </div>
          ) : checklists.length === 0 ? (
            <p className="text-sm text-gray-400">No checklists started today.</p>
          ) : (
            <div className="space-y-2">
              {checklists.slice(0, 8).map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{checklistLabel(c.template_id)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {c.steps_done}/{c.steps_total}
                    </span>
                    <StatusBadge label={c.status} status={c.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

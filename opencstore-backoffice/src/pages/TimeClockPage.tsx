import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import { fmtDateTime } from '../lib/date';
import { fmtMoney } from '../lib/currency';
import { useAuth } from '../modules/auth/AuthContext';
import { can } from '../modules/auth/roles';
import { computeHours } from '../modules/timeclock/timeclock-rules';
import {
  TimeClockService,
  type TimeClockEntry,
  type ActiveUserStatus,
} from '../modules/timeclock/timeclock.service';

function entryHours(e: TimeClockEntry): number | null {
  if (!e.clock_out) return null;
  try {
    return computeHours(e.clock_in, e.clock_out, e.break_minutes, null).hoursWorked;
  } catch {
    return null;
  }
}

export default function TimeClockPage() {
  const { user } = useAuth();
  const isManager = user ? can(user.role, 'manage_time_clock') : false;
  // Shared between the two sections below (each has its own independent
  // load-on-mount state): bumped by either a clock in/out or a manager's
  // correction, so both refresh immediately — covers a manager clocking
  // themselves in (Team should reflect it right away) and a manager
  // correcting their own entry (My Time Clock should reflect it too)
  // without waiting for a manual page reload.
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey(k => k + 1);

  return (
    <>
      <PageHeader title="Time Clock" subtitle="Clock in and out; managers can review and correct entries" />
      <MyTimeClock refreshKey={refreshKey} onChange={bump} />
      {isManager && <TeamSection refreshKey={refreshKey} onChange={bump} />}
    </>
  );
}

// ─── My Time Clock ──────────────────────────────────────────────────────────

function MyTimeClock({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [status, setStatus] = useState<TimeClockEntry | null | undefined>(undefined);
  const [entries, setEntries] = useState<TimeClockEntry[]>([]);
  const [breakingOut, setBreakingOut] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [s, e] = await Promise.all([TimeClockService.getMyStatus(), TimeClockService.listMyEntries()]);
    setStatus(s);
    setEntries(e);
  }

  useEffect(() => { load(); }, [refreshKey]);

  async function doClockIn() {
    setBusy(true);
    setError(null);
    try {
      await TimeClockService.clockIn();
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function doClockOut() {
    setBusy(true);
    setError(null);
    try {
      await TimeClockService.clockOut(Number(breakMinutes) || 0);
      setBreakingOut(false);
      setBreakMinutes('0');
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-3">My Time Clock</h2>

      {status === undefined ? (
        <div className="animate-pulse h-16 bg-gray-100 rounded" />
      ) : status ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Clocked in since <span className="font-medium">{fmtDateTime(status.clock_in)}</span>
          </p>
          {breakingOut ? (
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Unpaid Break (minutes)</label>
                <input
                  type="number" min="0" step="1" className="input w-32"
                  value={breakMinutes} onChange={e => setBreakMinutes(e.target.value)}
                />
              </div>
              <button className="btn-primary disabled:opacity-50" disabled={busy} onClick={doClockOut}>
                {busy ? 'Clocking Out…' : 'Confirm Clock Out'}
              </button>
              <button className="text-sm text-gray-500" onClick={() => setBreakingOut(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn-primary" onClick={() => setBreakingOut(true)}>Clock Out</button>
          )}
        </div>
      ) : (
        <button className="btn-primary disabled:opacity-50" disabled={busy} onClick={doClockIn}>
          {busy ? 'Clocking In…' : 'Clock In'}
        </button>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {entries.length > 0 && (
        <table className="table-base w-full text-xs mt-4">
          <thead>
            <tr>
              <th className="text-left">Clock In</th>
              <th className="text-left">Clock Out</th>
              <th className="text-right">Break (min)</th>
              <th className="text-right">Hours</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 10).map(e => (
              <tr key={e.id}>
                <td>{fmtDateTime(e.clock_in)}</td>
                <td>{e.clock_out ? fmtDateTime(e.clock_out) : '—'}</td>
                <td className="text-right tabular-nums">{e.break_minutes}</td>
                <td className="text-right tabular-nums">{entryHours(e) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Team (managers/owners only) ────────────────────────────────────────────

function TeamSection({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [users, setUsers] = useState<ActiveUserStatus[] | null>(null);
  const [entries, setEntries] = useState<TimeClockEntry[] | null>(null);
  const [editing, setEditing] = useState<TimeClockEntry | null>(null);

  async function load() {
    const [u, e] = await Promise.all([TimeClockService.listActiveUsers(), TimeClockService.listEntries()]);
    setUsers(u);
    setEntries(e);
  }

  useEffect(() => { load(); }, [refreshKey]);

  if (!users || !entries) {
    return <div className="animate-pulse space-y-2">{[1, 2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}</div>;
  }

  return (
    <>
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Team Status</h2>
        <table className="table-base w-full text-xs">
          <thead>
            <tr>
              <th className="text-left">Name</th>
              <th className="text-left">Role</th>
              <th className="text-right">Hourly Wage</th>
              <th className="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.display_name}</td>
                <td className="text-gray-500">{u.role}</td>
                <td className="text-right tabular-nums">{fmtMoney(u.hourly_wage ?? undefined)}</td>
                <td>
                  <StatusBadge label={u.open_entry_id ? 'Clocked In' : 'Clocked Out'} status={u.open_entry_id ? 'ok' : 'gray'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-800 mb-3">All Time Entries</h2>
        {entries.length === 0 ? (
          <EmptyState title="No time entries yet" description="Clock-in/out entries will show up here." icon="◔" />
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="table-base w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left">Employee</th>
                  <th className="text-left">Clock In</th>
                  <th className="text-left">Clock Out</th>
                  <th className="text-right">Break (min)</th>
                  <th className="text-right">Hours</th>
                  <th></th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td>{e.display_name}</td>
                    <td>{fmtDateTime(e.clock_in)}</td>
                    <td>{e.clock_out ? fmtDateTime(e.clock_out) : '—'}</td>
                    <td className="text-right tabular-nums">{e.break_minutes}</td>
                    <td className="text-right tabular-nums">{entryHours(e) ?? '—'}</td>
                    <td>{e.edited_by && <StatusBadge label="Corrected" variant="purple" />}</td>
                    <td className="text-right">
                      {e.clock_out && (
                        <button className="text-blue-600 hover:underline" onClick={() => setEditing(e)}>Edit</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditEntryDialog entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChange(); }} />
      )}
    </>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditEntryDialog({ entry, onClose, onSaved }: { entry: TimeClockEntry; onClose: () => void; onSaved: () => void }) {
  const [clockIn, setClockIn] = useState(toLocalInput(entry.clock_in));
  const [clockOut, setClockOut] = useState(entry.clock_out ? toLocalInput(entry.clock_out) : '');
  const [breakMinutes, setBreakMinutes] = useState(String(entry.break_minutes));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!reason.trim()) { setError('A reason is required for corrections.'); return; }
    setSaving(true);
    setError(null);
    try {
      await TimeClockService.editEntry(
        entry.id,
        new Date(clockIn).toISOString(),
        new Date(clockOut).toISOString(),
        Number(breakMinutes) || 0,
        reason
      );
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
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Correct Entry: {entry.display_name}</h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Clock In</label>
          <input type="datetime-local" className="input w-full" value={clockIn} onChange={e => setClockIn(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Clock Out</label>
          <input type="datetime-local" className="input w-full" value={clockOut} onChange={e => setClockOut(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Break (minutes)</label>
          <input type="number" min="0" className="input w-full" value={breakMinutes} onChange={e => setBreakMinutes(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Reason for correction</label>
          <input type="text" className="input w-full" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. forgot to clock out" />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Correction'}
          </button>
        </div>
      </div>
    </div>
  );
}

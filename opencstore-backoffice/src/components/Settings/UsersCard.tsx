import React, { useEffect, useState } from 'react';
import StatusBadge from '../common/StatusBadge';
import { UserManagementService, type ManagedUser, type NewUserInput } from '../../modules/users/user-management.service';
import { compose, required, passwordMinLength, passwordsMatch } from '../../lib/validation';

const EMPTY_FORM: NewUserInput & { confirm: string } = {
  username: '', password: '', confirm: '', display_name: '', role: 'cashier',
};

export default function UsersCard() {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  async function load() {
    setUsers(await UserManagementService.listUsers());
  }

  useEffect(() => { load(); }, []);

  async function createUser() {
    const usernameErr = required(form.username);
    const displayErr = required(form.display_name);
    const passwordErr = passwordMinLength(form.password);
    const confirmErr = passwordsMatch(form.password)(form.confirm);
    const firstError = usernameErr ?? displayErr ?? passwordErr ?? confirmErr;
    if (firstError) { setError(firstError); return; }

    setSaving(true);
    setError(null);
    try {
      await UserManagementService.createUser(form);
      setForm(EMPTY_FORM);
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: ManagedUser) {
    setBusyId(user.id);
    setError(null);
    try {
      await UserManagementService.setActive(user.id, !user.is_active);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function submitReset() {
    if (!resetTarget) return;
    const passwordErr = passwordMinLength(resetPassword);
    const confirmErr = passwordsMatch(resetPassword)(resetConfirm);
    const firstError = passwordErr ?? confirmErr;
    if (firstError) { setResetError(firstError); return; }

    setResetSaving(true);
    setResetError(null);
    try {
      await UserManagementService.resetPassword(resetTarget.id, resetPassword);
      setResetTarget(null);
      setResetPassword('');
      setResetConfirm('');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetSaving(false);
    }
  }

  if (!users) {
    return <div className="animate-pulse h-24 bg-gray-100 rounded-lg" />;
  }

  return (
    <div className="card max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Users</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Create accounts for your team, reset a forgotten password, or deactivate someone who's
          left — all without needing them to remember anything on their own.
        </p>
      </div>

      <table className="table-base w-full text-xs">
        <thead>
          <tr>
            <th className="text-left">User</th>
            <th className="text-left">Role</th>
            <th className="text-left">Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>
                <div className="font-medium text-gray-800">{u.display_name}</div>
                <div className="text-gray-400">{u.username}</div>
              </td>
              <td className="capitalize">{u.role}</td>
              <td>
                <StatusBadge label={u.is_active ? 'Active' : 'Deactivated'} variant={u.is_active ? 'green' : 'gray'} />
              </td>
              <td className="text-right space-x-3 whitespace-nowrap">
                <button
                  className="text-blue-600 hover:underline disabled:opacity-40"
                  disabled={busyId === u.id}
                  onClick={() => { setResetTarget(u); setResetError(null); }}
                >
                  Reset password
                </button>
                <button
                  className="text-gray-500 hover:underline disabled:opacity-40"
                  disabled={busyId === u.id}
                  onClick={() => toggleActive(u)}
                >
                  {u.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {adding ? (
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
              <input type="text" className="input w-full" value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
              <input type="text" className="input w-full" value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input type="password" className="input w-full" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" className="input w-full" value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select className="input w-full" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as NewUserInput['role'] }))}>
              <option value="owner">Owner / Admin</option>
              <option value="manager">Manager</option>
              <option value="cashier">Shift Lead / Cashier</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={createUser}>
              {saving ? 'Creating…' : 'Create User'}
            </button>
            <button className="text-sm text-gray-500" onClick={() => { setAdding(false); setForm(EMPTY_FORM); setError(null); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>Add User</button>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setResetTarget(null)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Reset password for {resetTarget.display_name}</h2>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" className="input w-full" value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input type="password" className="input w-full" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} />
            </div>
            {resetError && <p className="text-xs text-red-600">{resetError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => { setResetTarget(null); setResetPassword(''); setResetConfirm(''); setResetError(null); }}>
                Cancel
              </button>
              <button className="btn-primary disabled:opacity-50" disabled={resetSaving} onClick={submitReset}>
                {resetSaving ? 'Saving…' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

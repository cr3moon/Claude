import React, { useEffect, useState } from 'react';
import StatusBadge from '../common/StatusBadge';
import {
  StoreAccessService,
  type AccessibleStore,
  type StoreInput,
  type StoreUserRow,
} from '../../modules/stores/store-access.service';

const EMPTY_FORM: StoreInput = {
  name: '', address: '', city: '', state: '', zip: '', phone: '',
  timezone: 'UTC', tax_rate: 0, fuel_tax_rate: 0,
};

export default function LocationsCard() {
  const [stores, setStores] = useState<AccessibleStore[] | null>(null);
  const [users, setUsers] = useState<StoreUserRow[]>([]);
  const [userAccess, setUserAccess] = useState<Map<string, Set<string>>>(new Map());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<StoreInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    const [s, u] = await Promise.all([StoreAccessService.listAccessible(), StoreAccessService.listAllUsers()]);
    setStores(s);
    setUsers(u);
    const access = new Map<string, Set<string>>();
    for (const usr of u) {
      const theirs = await StoreAccessService.listAccessibleFor(usr.id);
      access.set(usr.id, new Set(theirs.map(t => t.id)));
    }
    setUserAccess(access);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name.trim()) { setError('Location name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await StoreAccessService.createStore(form);
      setForm(EMPTY_FORM);
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccess(userId: string, storeId: string, hasAccess: boolean) {
    const key = `${userId}:${storeId}`;
    setBusyKey(key);
    try {
      if (hasAccess) await StoreAccessService.revokeAccess(userId, storeId);
      else await StoreAccessService.grantAccess(userId, storeId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  if (!stores) {
    return <div className="animate-pulse h-24 bg-gray-100 rounded-lg" />;
  }

  return (
    <div className="card max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Locations</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Multiple physical stores share this one install. Add a location, then grant other
          employees access to it — everyone keeps their original home store; this only adds more.
        </p>
      </div>

      <table className="table-base w-full text-xs">
        <thead>
          <tr><th className="text-left">Location</th><th></th></tr>
        </thead>
        <tbody>
          {stores.map(s => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.isHome && <StatusBadge label="Your Home" variant="blue" />}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding ? (
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location Name</label>
            <input type="text" className="input w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Timezone</label>
              <input type="text" className="input w-full" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
              <input type="text" className="input w-full" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sales Tax Rate (%)</label>
              <input type="number" step="0.01" min="0" className="input w-full" value={form.tax_rate}
                onChange={e => setForm(f => ({ ...f, tax_rate: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fuel Tax Rate (%)</label>
              <input type="number" step="0.01" min="0" className="input w-full" value={form.fuel_tax_rate}
                onChange={e => setForm(f => ({ ...f, fuel_tax_rate: Number(e.target.value) }))} />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={save}>
              {saving ? 'Adding…' : 'Add Location'}
            </button>
            <button className="text-sm text-gray-500" onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>Add Location</button>
      )}

      {stores.length > 1 && users.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Team Access</h3>
          <p className="text-xs text-gray-500 mb-2">Check a box to grant that employee access to that location.</p>
          <table className="table-base w-full text-xs">
            <thead>
              <tr>
                <th className="text-left">Employee</th>
                {stores.map(s => <th key={s.id} className="text-center">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.display_name}</td>
                  {stores.map(s => {
                    const isHomeForUser = u.store_id === s.id;
                    const has = isHomeForUser || (userAccess.get(u.id)?.has(s.id) ?? false);
                    const key = `${u.id}:${s.id}`;
                    return (
                      <td key={s.id} className="text-center">
                        <input
                          type="checkbox"
                          checked={has}
                          disabled={isHomeForUser || busyKey === key}
                          onChange={() => toggleAccess(u.id, s.id, has)}
                          title={isHomeForUser ? 'Home store — always accessible' : undefined}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

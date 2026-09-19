import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../modules/auth/AuthContext';
import { can } from '../modules/auth/roles';
import { StoreService, type StoreUpdate } from '../modules/settings/store.service';

const EMPTY_FORM: StoreUpdate = {
  name: '', address: '', city: '', state: '', zip: '', phone: '',
  timezone: 'UTC', tax_rate: 0, fuel_tax_rate: 0,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [form,    setForm]    = useState<StoreUpdate>(EMPTY_FORM);
  const [posType, setPosType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const isOwner = user ? can(user.role, 'edit_settings') : false;

  useEffect(() => {
    (async () => {
      try {
        const store = await StoreService.get();
        if (store) {
          setForm({
            name: store.name, address: store.address ?? '', city: store.city ?? '',
            state: store.state ?? '', zip: store.zip ?? '', phone: store.phone ?? '',
            timezone: store.timezone, tax_rate: store.tax_rate, fuel_tax_rate: store.fuel_tax_rate,
          });
          setPosType(store.pos_type);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await StoreService.update(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function textField(key: keyof StoreUpdate, label: string) {
    return (
      <div key={key}>
        <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
        <input
          type="text"
          className="input w-full disabled:bg-gray-50 disabled:text-gray-400"
          value={String(form[key] ?? '')}
          disabled={!isOwner}
          onChange={e => setForm(s => ({ ...s, [key]: e.target.value }))}
        />
      </div>
    );
  }

  function numberField(key: 'tax_rate' | 'fuel_tax_rate', label: string) {
    return (
      <div key={key}>
        <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
        <input
          type="number" step="0.01" min="0"
          className="input w-full disabled:bg-gray-50 disabled:text-gray-400"
          value={form[key] ?? 0}
          disabled={!isOwner}
          onChange={e => setForm(s => ({ ...s, [key]: Number(e.target.value) }))}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Settings" subtitle={isOwner ? 'Edit store configuration' : 'View-only (owner role required to edit)'} />

      <form onSubmit={save} className="card max-w-xl space-y-4">
        {textField('name',    'Store Name')}
        {textField('address', 'Store Address')}
        <div className="grid grid-cols-3 gap-4">
          {textField('city',  'City')}
          {textField('state', 'State')}
          {textField('zip',   'ZIP')}
        </div>
        {textField('phone',    'Phone')}
        {textField('timezone', 'Timezone')}
        <div className="grid grid-cols-2 gap-4">
          {numberField('tax_rate',      'Sales Tax Rate (%)')}
          {numberField('fuel_tax_rate', 'Fuel Tax Rate (%)')}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">POS Adapter</label>
          <input
            type="text"
            className="input w-full bg-gray-50 text-gray-400"
            value={posType ?? ''}
            disabled
            title="Adapter type is set during onboarding"
          />
          <p className="text-xs text-gray-400 mt-0.5">Set during onboarding — contact support to change.</p>
        </div>

        {isOwner && (
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
            {saved && <span className="text-sm text-green-600">Saved!</span>}
          </div>
        )}
      </form>
    </>
  );
}

import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../modules/auth/AuthContext';
import { can } from '../modules/auth/roles';

interface AppSettings {
  store_name:        string;
  store_address:     string;
  default_tax_rate:  string;
  adapter_type:      string;
  timezone:          string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>({
    store_name: '', store_address: '', default_tax_rate: '0', adapter_type: '', timezone: 'UTC',
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const isOwner = user ? can(user.role, 'edit_settings') : false;

  useEffect(() => {
    (async () => {
      try {
        const s = await window.electronAPI.getSettings();
        setSettings(prev => ({ ...prev, ...s }));
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
      await window.electronAPI.saveSettings?.(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof AppSettings, label: string, type: string = 'text') {
    return (
      <div key={key}>
        <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
        <input
          type={type}
          className="input w-full disabled:bg-gray-50 disabled:text-gray-400"
          value={String(settings[key])}
          disabled={!isOwner}
          onChange={e => setSettings(s => ({
            ...s,
            [key]: type === 'number' ? Number(e.target.value) : e.target.value,
          }))}
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
        {field('store_name',       'Store Name')}
        {field('store_address',    'Store Address')}
        {field('default_tax_rate', 'Default Tax Rate (%)', 'number')}
        {field('timezone',         'Timezone')}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">POS Adapter</label>
          <input
            type="text"
            className="input w-full bg-gray-50 text-gray-400"
            value={settings.adapter_type}
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

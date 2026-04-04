import React, { useEffect, useState } from 'react';
import { useAuth } from '../../App';

interface StoreData {
  id: string; name: string; address: string; city: string; state: string;
  zip: string; phone: string; timezone: string; tax_rate: number;
  fuel_tax_rate: number; pos_type: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [store, setStore]   = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getStore().then(s => {
      setStore(s as StoreData);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-gray-400">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      {/* Store info */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="font-semibold text-gray-800">Store Information</h3>
        </div>
        <div className="card-body">
          {store ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Store Name', store.name],
                ['Address', [store.address, store.city, store.state, store.zip].filter(Boolean).join(', ')],
                ['Phone', store.phone || '—'],
                ['Timezone', store.timezone],
                ['Sales Tax Rate', `${store.tax_rate}%`],
                ['Fuel Tax Rate', `${store.fuel_tax_rate}%`],
                ['POS Type', store.pos_type],
              ].map(([k, v]) => (
                <div key={k as string} className="py-1.5 border-b border-gray-50">
                  <dt className="text-gray-400 text-xs uppercase tracking-wide">{k}</dt>
                  <dd className="text-gray-800 font-medium mt-0.5">{v || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : <div className="text-gray-400">No store configured.</div>}
          <div className="mt-4">
            <div className="alert-info text-xs">To update store information, re-run the setup wizard. (Full settings editing UI is in the roadmap.)</div>
          </div>
        </div>
      </div>

      {/* Current user */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="font-semibold text-gray-800">Current User</h3>
        </div>
        <div className="card-body">
          {user ? (
            <dl className="text-sm space-y-2">
              <div><dt className="text-gray-400 text-xs uppercase tracking-wide">Name</dt><dd className="font-medium">{user.display_name}</dd></div>
              <div><dt className="text-gray-400 text-xs uppercase tracking-wide">Role</dt><dd className="font-medium capitalize">{user.role}</dd></div>
            </dl>
          ) : <div className="text-gray-400">Not logged in.</div>}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold text-gray-800">About OpenCStore</h3>
        </div>
        <div className="card-body text-xs text-gray-600 space-y-2 leading-relaxed">
          <p><strong>OpenCStore Back Office</strong> is a free, open-source local back-office tool for independent gas station and convenience store owners.</p>
          <p>This software is <strong>not affiliated with, endorsed by, or certified by</strong> Verifone, Gilbarco Veeder-Root, or any other POS vendor.</p>
          <p>POS integration features are adapters built on publicly observable file formats. They are clearly marked as adapters or mock implementations and do not imply official API access.</p>
          <p>No POS data is ever modified without explicit owner approval through the built-in review workflow.</p>
          <p className="text-gray-400">Version: 0.1.0-mvp | License: MIT</p>
        </div>
      </div>
    </div>
  );
}

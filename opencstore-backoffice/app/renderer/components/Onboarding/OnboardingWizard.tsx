import React, { useState } from 'react';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage',
  'America/Honolulu', 'Pacific/Honolulu',
];

const POS_TYPES = [
  { value: 'mock',          label: 'Demo / No live POS (use sample data)' },
  { value: 'file_import',   label: 'File import only (CSV / XML exports from POS)' },
  { value: 'verifone_ruby2',label: 'Verifone Ruby2 (adapter in progress – use file import for now)' },
  { value: 'commander',     label: 'Gilbarco Commander (adapter in progress – use file import for now)' },
];

interface StoreData {
  name: string; address: string; city: string; state: string; zip: string; phone: string;
  timezone: string; tax_rate: string; fuel_tax_rate: string; pos_type: string;
}

interface AdminData {
  username: string; password: string; confirmPassword: string; display_name: string;
}

interface Props {
  onComplete: (user: { id: string; display_name: string; role: 'owner' | 'manager' | 'cashier'; store_id: string }) => void;
}

export default function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [store, setStore] = useState<StoreData>({
    name: '', address: '', city: '', state: '', zip: '', phone: '',
    timezone: 'America/Chicago', tax_rate: '0', fuel_tax_rate: '0', pos_type: 'mock',
  });
  const [admin, setAdmin] = useState<AdminData>({
    username: '', password: '', confirmPassword: '', display_name: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);

  const steps = ['Welcome', 'Store Setup', 'POS Connection', 'Admin Account', 'Finish'];

  const validateStore = () => {
    const e: Record<string, string> = {};
    if (!store.name.trim())     e.name     = 'Store name is required.';
    if (!store.timezone)        e.timezone = 'Timezone is required.';
    if (isNaN(Number(store.tax_rate))) e.tax_rate = 'Enter a valid tax rate (e.g. 8.5).';
    return e;
  };

  const validateAdmin = () => {
    const e: Record<string, string> = {};
    if (!admin.username.trim())     e.username = 'Username is required.';
    if (admin.username.length < 3)  e.username = 'Username must be at least 3 characters.';
    if (!admin.display_name.trim()) e.display_name = 'Name is required.';
    if (admin.password.length < 8)  e.password = 'Password must be at least 8 characters.';
    if (admin.password !== admin.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    return e;
  };

  const next = () => {
    if (step === 1) {
      const e = validateStore();
      if (Object.keys(e).length) { setErrors(e); return; }
    }
    if (step === 3) {
      const e = validateAdmin();
      if (Object.keys(e).length) { setErrors(e); return; }
    }
    setErrors({});
    setStep(s => s + 1);
  };

  const finish = async () => {
    const e = validateAdmin();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);

    const result = await window.electronAPI.completeOnboarding({
      store: {
        name:          store.name,
        address:       store.address || undefined,
        city:          store.city    || undefined,
        state:         store.state   || undefined,
        zip:           store.zip     || undefined,
        phone:         store.phone   || undefined,
        timezone:      store.timezone,
        tax_rate:      Number(store.tax_rate),
        fuel_tax_rate: Number(store.fuel_tax_rate),
        pos_type:      store.pos_type,
      },
      admin: {
        username:     admin.username,
        password:     admin.password,
        display_name: admin.display_name,
      },
    }) as { success: boolean; storeId: string; userId: string };

    setLoading(false);

    if (result.success) {
      setComplete(true);
      setTimeout(() => {
        onComplete({
          id: result.userId,
          display_name: admin.display_name,
          role: 'owner',
          store_id: result.storeId,
        });
      }, 1500);
    }
  };

  if (complete) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">🎉</div>
          <div className="text-xl font-bold text-gray-800">Setup complete!</div>
          <div className="text-gray-500 mt-1">Opening your dashboard…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-brand-700">OpenCStore Back Office</div>
          <div className="text-gray-500 text-sm mt-1">First-time setup</div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-6 px-2">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                  ${i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-100 text-brand-700 border-2 border-brand-600' : 'bg-gray-200 text-gray-500'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div className={`text-xs ${i === step ? 'text-brand-700 font-medium' : 'text-gray-400'}`}>{s}</div>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-brand-600' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="card">
          <div className="card-body space-y-5">

            {/* Step 0: Welcome */}
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Welcome to OpenCStore Back Office</h2>
                <p className="text-gray-600 text-sm leading-relaxed">
                  This free tool helps independent gas station and convenience store owners manage:
                </p>
                <ul className="space-y-1.5 text-sm text-gray-700">
                  {['Daily sales reports and closing procedures', 'PLU / item data quality and cleanup', 'Pricing recommendations with margin guidance', 'Shift checklists and over/short tracking', 'Historical records and audit trail'].map(item => (
                    <li key={item} className="flex items-start gap-2"><span className="text-brand-600 mt-0.5">✓</span>{item}</li>
                  ))}
                </ul>
                <div className="alert-info text-xs">
                  <strong>Note:</strong> OpenCStore is not affiliated with, certified by, or endorsed by any POS vendor.
                  POS integration features are adapters that work with exported files or site-specific configurations.
                </div>
              </div>
            )}

            {/* Step 1: Store Setup */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Store Information</h2>
                <div>
                  <label className="label">Store Name *</label>
                  <input className={`input ${errors.name ? 'border-red-400' : ''}`} value={store.name}
                    onChange={e => setStore({...store, name: e.target.value})} placeholder="Main Street Fuel & Grocery" />
                  {errors.name && <div className="text-red-500 text-xs mt-1">{errors.name}</div>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Address</label>
                    <input className="input" value={store.address} onChange={e => setStore({...store, address: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">City</label>
                    <input className="input" value={store.city} onChange={e => setStore({...store, city: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">State</label>
                    <input className="input" value={store.state} onChange={e => setStore({...store, state: e.target.value})} maxLength={2} placeholder="TX" />
                  </div>
                  <div>
                    <label className="label">ZIP</label>
                    <input className="input" value={store.zip} onChange={e => setStore({...store, zip: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" value={store.phone} onChange={e => setStore({...store, phone: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Timezone *</label>
                    <select className="input" value={store.timezone} onChange={e => setStore({...store, timezone: e.target.value})}>
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Sales Tax Rate %</label>
                    <input className={`input ${errors.tax_rate ? 'border-red-400' : ''}`} value={store.tax_rate}
                      onChange={e => setStore({...store, tax_rate: e.target.value})} placeholder="8.25" />
                    {errors.tax_rate && <div className="text-red-500 text-xs mt-1">{errors.tax_rate}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: POS Connection */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">POS Integration</h2>
                <div>
                  <label className="label">POS / Integration Type</label>
                  <select className="input" value={store.pos_type} onChange={e => setStore({...store, pos_type: e.target.value})}>
                    {POS_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="alert-warning text-xs">
                  <strong>Important:</strong> Direct POS write-back requires site-specific configuration and is not enabled by default.
                  All changes go through a review-and-approval workflow before any export or write-back.
                  Your POS data is never modified without your explicit approval.
                </div>
                {store.pos_type === 'mock' && (
                  <div className="alert-info text-xs">
                    Demo mode will load sample data so you can explore all features without a live POS.
                  </div>
                )}
                {store.pos_type === 'file_import' && (
                  <div className="alert-info text-xs">
                    You will be able to import XML and CSV exports from your POS back-office software on the Data Import page.
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Admin Account */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Owner / Admin Account</h2>
                <p className="text-xs text-gray-500">Create your local administrator account. Passwords are stored hashed and never sent anywhere.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Full Name *</label>
                    <input className={`input ${errors.display_name ? 'border-red-400' : ''}`} value={admin.display_name}
                      onChange={e => setAdmin({...admin, display_name: e.target.value})} />
                    {errors.display_name && <div className="text-red-500 text-xs mt-1">{errors.display_name}</div>}
                  </div>
                  <div>
                    <label className="label">Username *</label>
                    <input className={`input ${errors.username ? 'border-red-400' : ''}`} value={admin.username}
                      onChange={e => setAdmin({...admin, username: e.target.value.toLowerCase().replace(/\s/g, '')})} />
                    {errors.username && <div className="text-red-500 text-xs mt-1">{errors.username}</div>}
                  </div>
                  <div>
                    <label className="label">Password *</label>
                    <input type="password" className={`input ${errors.password ? 'border-red-400' : ''}`} value={admin.password}
                      onChange={e => setAdmin({...admin, password: e.target.value})} />
                    {errors.password && <div className="text-red-500 text-xs mt-1">{errors.password}</div>}
                  </div>
                  <div>
                    <label className="label">Confirm Password *</label>
                    <input type="password" className={`input ${errors.confirmPassword ? 'border-red-400' : ''}`} value={admin.confirmPassword}
                      onChange={e => setAdmin({...admin, confirmPassword: e.target.value})} />
                    {errors.confirmPassword && <div className="text-red-500 text-xs mt-1">{errors.confirmPassword}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Finish */}
            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Ready to get started</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Store</span>
                    <span className="font-medium">{store.name}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">POS Type</span>
                    <span className="font-medium">{POS_TYPES.find(p => p.value === store.pos_type)?.label.split(' ')[0]}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Admin User</span>
                    <span className="font-medium">{admin.display_name} ({admin.username})</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-gray-500">Tax Rate</span>
                    <span className="font-medium">{store.tax_rate}%</span>
                  </div>
                </div>
                <div className="alert-info text-xs">
                  Click "Finish Setup" to save your configuration and open your dashboard.
                  You can change these settings anytime from the Settings page.
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(s => s - 1)}
                className="btn-secondary"
                disabled={step === 0}
              >
                Back
              </button>
              {step < steps.length - 1 ? (
                <button onClick={next} className="btn-primary">
                  Continue
                </button>
              ) : (
                <button onClick={finish} className="btn-primary" disabled={loading}>
                  {loading ? 'Setting up…' : 'Finish Setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

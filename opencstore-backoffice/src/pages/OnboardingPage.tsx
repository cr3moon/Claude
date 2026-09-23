import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingService } from '../modules/onboarding/onboarding.service';

type Step = 'welcome' | 'store' | 'admin' | 'adapter' | 'done';

const STEPS: Step[] = ['welcome', 'store', 'admin', 'adapter', 'done'];

interface StoreForm {
  name:           string;
  address:        string;
  city:           string;
  state:          string;
  zip:            string;
  phone:          string;
  timezone:       string;
  tax_rate:       number;
  fuel_tax_rate:  number;
}

interface AdminForm {
  display_name: string;
  username:     string;
  password:     string;
  confirm:      string;
}

const ADAPTER_OPTIONS = [
  { value: 'mock_commander', label: 'Mock / Demo (recommended for setup)' },
  { value: 'file_import',    label: 'File Import (XML / CSV)' },
  { value: 'commander',      label: 'Verifone Commander (fuel prices/totals live; item catalog via File Import)' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step,    setStep]    = useState<Step>('welcome');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');

  const [store,   setStore]   = useState<StoreForm>({
    name: '', address: '', city: '', state: '', zip: '', phone: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tax_rate: 0, fuel_tax_rate: 0,
  });
  const [admin,   setAdmin]   = useState<AdminForm>({
    display_name: '', username: '', password: '', confirm: '',
  });
  const [adapter, setAdapter] = useState('mock_commander');

  const stepIndex = STEPS.indexOf(step);

  async function handleFinish() {
    if (admin.password !== admin.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await OnboardingService.complete({
        store:   { ...store, pos_type: adapter },
        admin:   { display_name: admin.display_name, username: admin.username, password: admin.password },
      });
      setStep('done');
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">✓</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Setup complete!</h2>
          <p className="text-sm text-gray-500 mb-6">Your back office is ready to use.</p>
          <button className="btn-primary" onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {STEPS.filter(s => s !== 'done').map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-blue-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        <div className="card space-y-6">
          {/* Step: Welcome */}
          {step === 'welcome' && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">⛽</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to OpenCStore</h1>
              <p className="text-sm text-gray-500">
                Let's get your back-office set up. This will only take a few minutes.
              </p>
            </div>
          )}

          {/* Step: Store info */}
          {step === 'store' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Store Information</h2>
              {(['name', 'address', 'city', 'state', 'zip', 'phone', 'timezone'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1 capitalize">
                    {field.replace('_', ' ')}
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    value={store[field]}
                    onChange={e => setStore(s => ({ ...s, [field]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sales Tax Rate (%)</label>
                  <input
                    type="number" step="0.01" min="0"
                    className="input w-full"
                    value={store.tax_rate}
                    onChange={e => setStore(s => ({ ...s, tax_rate: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fuel Tax Rate (%)</label>
                  <input
                    type="number" step="0.01" min="0"
                    className="input w-full"
                    value={store.fuel_tax_rate}
                    onChange={e => setStore(s => ({ ...s, fuel_tax_rate: Number(e.target.value) }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step: Admin account */}
          {step === 'admin' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Create Owner Account</h2>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {(['display_name', 'username', 'password', 'confirm'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1 capitalize">
                    {field.replace('_', ' ')}
                  </label>
                  <input
                    type={field === 'password' || field === 'confirm' ? 'password' : 'text'}
                    className="input w-full"
                    value={admin[field]}
                    onChange={e => setAdmin(a => ({ ...a, [field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Step: Adapter */}
          {step === 'adapter' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">POS Connection</h2>
              <p className="text-sm text-gray-500">
                Choose how this back office connects to your point-of-sale system.
              </p>
              <div className="space-y-2">
                {ADAPTER_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      adapter === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adapter"
                      value={opt.value}
                      checked={adapter === opt.value}
                      onChange={() => setAdapter(opt.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(STEPS[stepIndex - 1])}
              disabled={stepIndex === 0}
              className="btn-secondary disabled:opacity-30"
            >
              Back
            </button>

            {step === 'adapter' ? (
              <button
                type="button"
                onClick={handleFinish}
                disabled={busy}
                className="btn-primary disabled:opacity-50"
              >
                {busy ? 'Setting up…' : 'Finish Setup'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(STEPS[stepIndex + 1])}
                className="btn-primary"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { UserManagementService, type RecoveryUsername } from '../../modules/users/user-management.service';
import { passwordMinLength, passwordsMatch } from '../../lib/validation';

interface Props {
  onClose: () => void;
}

type Step = 'store' | 'pick-user' | 'new-password' | 'done';

const NO_MATCH_ERROR = 'No active account found for that store name. Check the spelling and try again.';

export default function ForgotPasswordDialog({ onClose }: Props) {
  const [step, setStep] = useState<Step>('store');
  const [storeName, setStoreName] = useState('');
  const [usernames, setUsernames] = useState<RecoveryUsername[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findAccount() {
    if (!storeName.trim()) { setError('Enter your store name.'); return; }
    setBusy(true);
    setError(null);
    try {
      const found = await UserManagementService.getRecoveryUsernames(storeName);
      if (found.length === 0) {
        setError(NO_MATCH_ERROR);
        return;
      }
      setUsernames(found);
      setSelectedUsername(found[0].username);
      setStep('pick-user');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    const passwordErr = passwordMinLength(newPassword);
    const confirmErr = passwordsMatch(newPassword)(confirmPassword);
    const firstError = passwordErr ?? confirmErr;
    if (firstError) { setError(firstError); return; }

    setBusy(true);
    setError(null);
    try {
      await UserManagementService.recoverPassword(storeName, selectedUsername, newPassword);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4">
        {step === 'store' && (
          <>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Reset your password</h2>
              <p className="text-xs text-gray-500 mt-1">
                Enter your store's name exactly as it was set up during onboarding. Anyone who
                knows your store name and an active username on this install can reset that
                account's password — this is meant for the owner recovering their own access, not
                as a public-facing form.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Store Name</label>
              <input
                type="text" className="input w-full" value={storeName}
                onChange={e => setStoreName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') findAccount(); }}
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary disabled:opacity-50" disabled={busy} onClick={findAccount}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {step === 'pick-user' && (
          <>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Which account?</h2>
              <p className="text-xs text-gray-500 mt-1">Active accounts found for this store.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Account</label>
              <select className="input w-full" value={selectedUsername} onChange={e => setSelectedUsername(e.target.value)}>
                {usernames.map(u => (
                  <option key={u.id} value={u.username}>{u.display_name} ({u.username})</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => setStep('store')}>
                Back
              </button>
              <button className="btn-primary" onClick={() => setStep('new-password')}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 'new-password' && (
          <>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Set a new password</h2>
              <p className="text-xs text-gray-500 mt-1">for {selectedUsername}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" className="input w-full" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input type="password" className="input w-full" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => setStep('pick-user')}>
                Back
              </button>
              <button className="btn-primary disabled:opacity-50" disabled={busy} onClick={submitReset}>
                {busy ? 'Saving…' : 'Reset Password'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="text-center py-2 space-y-3">
            <div className="text-4xl">✓</div>
            <h2 className="text-base font-semibold text-gray-900">Password reset</h2>
            <p className="text-sm text-gray-500">
              Sign in with your new password.
            </p>
            <button className="btn-primary" onClick={onClose}>Back to Sign In</button>
          </div>
        )}
      </div>
    </div>
  );
}

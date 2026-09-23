import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import ForgotPasswordDialog from '../components/Auth/ForgotPasswordDialog';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const result = await login(username, password);
    setBusy(false);
    if (result.ok) {
      navigate('/dashboard');
    } else {
      setError(result.error ?? 'Invalid credentials.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">⛽</span>
          <h1 className="text-xl font-bold text-gray-900 mt-2">OpenCStore Back Office</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-xs font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              className="input w-full"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input w-full"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            className="w-full text-center text-xs text-gray-500 hover:text-gray-700 hover:underline"
            onClick={() => setShowRecovery(true)}
          >
            Forgot password?
          </button>
        </form>
      </div>

      {showRecovery && <ForgotPasswordDialog onClose={() => setShowRecovery(false)} />}
    </div>
  );
}

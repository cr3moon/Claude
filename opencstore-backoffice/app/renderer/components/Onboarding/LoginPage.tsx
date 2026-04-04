import React, { useState } from 'react';

interface Props {
  onLogin: (user: { id: string; display_name: string; role: 'owner' | 'manager' | 'cashier'; store_id: string }) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await window.electronAPI.login(username, password);
    setLoading(false);
    if (result.success && result.user) {
      onLogin(result.user as { id: string; display_name: string; role: 'owner' | 'manager' | 'cashier'; store_id: string });
    } else {
      setError(result.error ?? 'Login failed.');
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-brand-700">OpenCStore</div>
          <div className="text-gray-500 mt-1">Back Office</div>
        </div>

        <div className="card">
          <div className="card-body">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">Sign In</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  className="input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <div className="alert-error">{error}</div>}
              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        <div className="text-center mt-4 text-xs text-gray-400">
          OpenCStore Back Office – not affiliated with any POS vendor
        </div>
      </div>
    </div>
  );
}

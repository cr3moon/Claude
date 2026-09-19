import React, { useEffect, useState } from 'react';
import StatusBadge from '../common/StatusBadge';
import { fmtMoney } from '../../lib/currency';
import { fmtDateTime } from '../../lib/date';
import {
  CommanderNaxmlService,
  type CommanderConnectionSettings,
  type FuelGradePrice,
} from '../../modules/integrations/commander-naxml.service';

interface Props {
  disabled?: boolean;
}

export default function CommanderConnectionCard({ disabled }: Props) {
  const [settings, setSettings] = useState<CommanderConnectionSettings | null>(null);
  const [host,     setHost]     = useState('');
  const [port,     setPort]     = useState(443);
  const [username, setUsername] = useState('MANAGER');
  const [password, setPassword] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [prices, setPrices] = useState<FuelGradePrice[] | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = await CommanderNaxmlService.getConnectionSettings();
      if (existing) {
        setSettings(existing);
        setHost(existing.host);
        setPort(existing.port);
        setUsername(existing.username_hint);
      }
    })();
  }, []);

  async function testConnection(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    setPrices(null);
    setPricesError(null);
    try {
      const result = await CommanderNaxmlService.testConnection({ host, port, username, password });
      setTestResult(result);
      if (result.success) {
        setSettings({ host, port, username_hint: username, connection_status: 'ok', last_tested_at: new Date().toISOString() });
        await loadPrices();
      }
    } finally {
      setTesting(false);
    }
  }

  async function loadPrices() {
    setLoadingPrices(true);
    setPricesError(null);
    try {
      setPrices(await CommanderNaxmlService.getFuelPrices());
    } catch (err) {
      setPricesError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPrices(false);
    }
  }

  return (
    <div className="card max-w-xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Fuel POS Connection (Verifone Commander)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Connects directly to a Commander site controller's NAXML API to read live fuel prices and
          totals. Read-only — no prices are written or pushed to dispensers from here.
        </p>
      </div>

      {settings && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <StatusBadge
            label={settings.connection_status}
            status={settings.connection_status === 'ok' ? 'success' : settings.connection_status === 'failed' ? 'error' : 'pending'}
          />
          {settings.last_tested_at && <span>Last tested {fmtDateTime(settings.last_tested_at)}</span>}
        </div>
      )}

      <form onSubmit={testConnection} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Host / IP</label>
            <input
              type="text" required placeholder="192.168.1.50"
              className="input w-full disabled:bg-gray-50 disabled:text-gray-400"
              value={host} disabled={disabled}
              onChange={e => setHost(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
            <input
              type="number" min="1" max="65535"
              className="input w-full disabled:bg-gray-50 disabled:text-gray-400"
              value={port} disabled={disabled}
              onChange={e => setPort(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text" required
              className="input w-full disabled:bg-gray-50 disabled:text-gray-400"
              value={username} disabled={disabled}
              onChange={e => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password" required placeholder="Not stored — entered each session"
              className="input w-full disabled:bg-gray-50 disabled:text-gray-400"
              value={password} disabled={disabled}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-secondary" disabled={disabled || testing}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          {testResult && (
            <span className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.message}
            </span>
          )}
        </div>
      </form>

      {(loadingPrices || prices || pricesError) && (
        <div className="pt-2 border-t border-gray-100">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Current Fuel Prices</h3>
          {loadingPrices ? (
            <div className="animate-pulse h-16 bg-gray-100 rounded" />
          ) : pricesError ? (
            <p className="text-xs text-red-600">{pricesError}</p>
          ) : prices && prices.length === 0 ? (
            <p className="text-xs text-gray-400">No active fuel grades returned.</p>
          ) : (
            <table className="table-base w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left">Grade</th>
                  <th className="text-right">In-Effect Cash</th>
                  <th className="text-right">In-Effect Credit</th>
                  <th className="text-right">Pending Cash</th>
                  <th className="text-right">Pending Credit</th>
                </tr>
              </thead>
              <tbody>
                {prices?.map(g => (
                  <tr key={g.sysid}>
                    <td>{g.name}</td>
                    <td className="text-right tabular-nums">{fmtMoney(g.inEffectCash ?? undefined)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(g.inEffectCredit ?? undefined)}</td>
                    <td className="text-right tabular-nums text-gray-500">{fmtMoney(g.pendingCash ?? undefined)}</td>
                    <td className="text-right tabular-nums text-gray-500">{fmtMoney(g.pendingCredit ?? undefined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

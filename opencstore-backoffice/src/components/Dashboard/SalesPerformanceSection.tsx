import React, { useEffect, useState } from 'react';
import BarChart from '../charts/BarChart';
import LineChart from '../charts/LineChart';
import { fmtMoney } from '../../lib/currency';
import { CommanderNaxmlService, type FuelGradePrice } from '../../modules/integrations/commander-naxml.service';
import { DashboardDataService, type CategoryValue, type DayValue, type FuelTrendSeries } from '../../modules/dashboard/dashboard-data.service';
import DailySalesEntryDialog from './DailySalesEntryDialog';

function monthRange(offset: number): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  return {
    startDate: iso(start),
    endDate: iso(end),
    label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

export default function SalesPerformanceSection() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [fuelPrices, setFuelPrices] = useState<FuelGradePrice[] | null>(null);
  const [deptTotals, setDeptTotals] = useState<CategoryValue[] | null>(null);
  const [dailyTotals, setDailyTotals] = useState<DayValue[] | null>(null);
  const [fuelRevenue, setFuelRevenue] = useState<DayValue[] | null>(null);
  const [fuelVolume, setFuelVolume] = useState<FuelTrendSeries[] | null>(null);
  const [merchTotal, setMerchTotal] = useState(0);
  const [fuelTotals, setFuelTotals] = useState({ gallons: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const [loggingSales, setLoggingSales] = useState(false);

  const range = monthRange(monthOffset);

  async function load() {
    setLoading(true);
    try {
      const [dept, daily, fRev, fVol, merchSum, fuelSum] = await Promise.all([
        DashboardDataService.getDepartmentTotals(range),
        DashboardDataService.getDailyTotals(range),
        DashboardDataService.getFuelRevenueTrend(range),
        DashboardDataService.getFuelVolumeTrend(range),
        DashboardDataService.getSalesPeriodTotal(range),
        DashboardDataService.getFuelPeriodTotals(range),
      ]);
      setDeptTotals(dept);
      setDailyTotals(daily);
      setFuelRevenue(fRev);
      setFuelVolume(fVol);
      setMerchTotal(merchSum);
      setFuelTotals(fuelSum);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [monthOffset]);

  useEffect(() => {
    (async () => {
      try {
        setFuelPrices(await CommanderNaxmlService.getFuelPrices());
      } catch {
        setFuelPrices([]); // not connected — hide the section rather than error out
      }
      // Best-effort: build today's point in the fuel trend. Silent if not connected.
      try {
        await DashboardDataService.captureFuelSnapshotToday();
        load();
      } catch {
        // no Commander connection — trend just won't have today's point yet
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Store Performance</h2>
        <div className="flex items-center gap-3">
          <button className="text-sm text-gray-500 hover:text-gray-700" onClick={() => setMonthOffset(o => o - 1)}>‹</button>
          <span className="text-sm font-medium text-gray-700 w-32 text-center">{range.label}</span>
          <button className="text-sm text-gray-500 hover:text-gray-700" onClick={() => setMonthOffset(o => o + 1)} disabled={monthOffset >= 0}>›</button>
          <button className="btn-secondary text-xs ml-3" onClick={() => setLoggingSales(true)}>Log Daily Sales</button>
        </div>
      </div>

      {fuelPrices && fuelPrices.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Last Received Fuel Price</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {fuelPrices.map(p => (
              <div key={p.sysid} className="card py-3">
                <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-bold text-gray-900 tabular-nums">{fmtMoney(p.inEffectCash ?? undefined)}</span>
                  <span className="text-xs text-gray-400">cash</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-gray-600 tabular-nums">{fmtMoney(p.inEffectCredit ?? undefined)}</span>
                  <span className="text-xs text-gray-400">credit</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <p className="text-xs font-medium text-gray-500 mb-2">Department Sales</p>
          {loading || !deptTotals ? (
            <div className="animate-pulse h-56 bg-gray-100 rounded" />
          ) : (
            <BarChart
              data={deptTotals.map(d => ({ label: d.category, value: d.value }))}
              categorical valueFormat={v => fmtMoney(v)}
            />
          )}
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500 mb-2">Merchandise Sales</p>
          {loading || !dailyTotals ? (
            <div className="animate-pulse h-56 bg-gray-100 rounded" />
          ) : (
            <BarChart data={dailyTotals.map(d => ({ label: d.date.slice(5), value: d.value }))} valueFormat={v => fmtMoney(v)} />
          )}
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500 mb-2">Fuel Sales</p>
          {loading || !fuelRevenue ? (
            <div className="animate-pulse h-56 bg-gray-100 rounded" />
          ) : (
            <BarChart
              data={fuelRevenue.map(d => ({ label: d.date.slice(5), value: d.value, color: '#eb6834' }))}
              valueFormat={v => fmtMoney(v)}
            />
          )}
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500 mb-2">Fuel Volume</p>
          {loading || !fuelVolume ? (
            <div className="animate-pulse h-56 bg-gray-100 rounded" />
          ) : (
            <LineChart
              series={fuelVolume.map(s => ({ label: s.grade, points: s.points }))}
              valueFormat={v => `${v.toLocaleString()} gal`}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card py-3">
          <p className="text-xs text-gray-500">Net Sales</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{fmtMoney(merchTotal + fuelTotals.revenue)}</p>
        </div>
        <div className="card py-3">
          <p className="text-xs text-gray-500">Merch Sales</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{fmtMoney(merchTotal)}</p>
        </div>
        <div className="card py-3">
          <p className="text-xs text-gray-500">Fuel Sales</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{fmtMoney(fuelTotals.revenue)}</p>
        </div>
        <div className="card py-3">
          <p className="text-xs text-gray-500">Fuel Volume</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{fuelTotals.gallons.toLocaleString()} gal</p>
        </div>
      </div>

      {loggingSales && (
        <DailySalesEntryDialog onClose={() => setLoggingSales(false)} onSaved={() => { setLoggingSales(false); load(); }} />
      )}
    </div>
  );
}

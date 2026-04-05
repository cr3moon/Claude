import React from 'react';

interface MetricCardProps {
  label:       string;
  value:       string | number;
  sub?:        string;
  trend?:      number;   // positive = up, negative = down
  trendLabel?: string;
  icon?:       React.ReactNode;
  loading?:    boolean;
}

function TrendIndicator({ trend, label }: { trend: number; label?: string }) {
  const up      = trend >= 0;
  const color   = up ? 'text-green-600' : 'text-red-600';
  const arrow   = up ? '▲' : '▼';
  const pct     = Math.abs(trend).toFixed(1);

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <span aria-hidden="true">{arrow}</span>
      {pct}%{label ? ` ${label}` : ''}
    </span>
  );
}

export default function MetricCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  icon,
  loading = false,
}: MetricCardProps) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>

      {loading ? (
        <div className="h-8 w-24 rounded bg-gray-100 animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">
          {value}
        </p>
      )}

      <div className="flex items-center gap-2 min-h-[1.25rem]">
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
        {trend !== undefined && !loading && (
          <TrendIndicator trend={trend} label={trendLabel} />
        )}
      </div>
    </div>
  );
}

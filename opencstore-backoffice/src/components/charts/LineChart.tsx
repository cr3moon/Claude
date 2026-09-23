import React, { useState } from 'react';
import { CHART_CHROME, categoricalColor } from './palette';

export interface LineSeries {
  label: string;
  points: { date: string; value: number }[];
  color?: string;
}

interface LineChartProps {
  series: LineSeries[];
  height?: number;
  valueFormat?: (v: number) => string;
}

const WIDTH = 640;
const PADDING = { top: 12, right: 12, bottom: 36, left: 48 };

function niceMax(max: number): number {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

export default function LineChart({ series, height = 220, valueFormat = String }: LineChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const dates = series[0]?.points.map(p => p.date) ?? [];
  const maxValue = niceMax(Math.max(0, ...series.flatMap(s => s.points.map(p => p.value))));
  const n = dates.length;
  const xFor = (i: number) => PADDING.left + (n > 1 ? (i / (n - 1)) * innerWidth : innerWidth / 2);
  const yFor = (v: number) => PADDING.top + innerHeight - (maxValue > 0 ? (v / maxValue) * innerHeight : 0);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxValue * f));
  const tickEvery = Math.max(1, Math.ceil(n / 8));

  if (n === 0 || series.length === 0) {
    return <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>No data for this period.</div>;
  }

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = (e.target as SVGRectElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = Math.min(1, Math.max(0, (x - PADDING.left) / innerWidth));
    setHoverIdx(Math.round(frac * (n - 1)));
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={yFor(t)} y2={yFor(t)} stroke={CHART_CHROME.gridline} strokeWidth={1} />
            <text x={PADDING.left - 6} y={yFor(t) + 3} textAnchor="end" fontSize={9} fill={CHART_CHROME.mutedInk}>
              {t.toLocaleString()}
            </text>
          </g>
        ))}
        <line
          x1={PADDING.left} x2={WIDTH - PADDING.right}
          y1={PADDING.top + innerHeight} y2={PADDING.top + innerHeight}
          stroke={CHART_CHROME.baseline} strokeWidth={1}
        />
        {dates.map((d, i) => (
          i % tickEvery === 0 ? (
            <text key={d} x={xFor(i)} y={PADDING.top + innerHeight + 14} textAnchor="middle" fontSize={8} fill={CHART_CHROME.mutedInk}>
              {fmtDateShort(d)}
            </text>
          ) : null
        ))}

        {hoverIdx !== null && (
          <line
            x1={xFor(hoverIdx)} x2={xFor(hoverIdx)}
            y1={PADDING.top} y2={PADDING.top + innerHeight}
            stroke={CHART_CHROME.baseline} strokeWidth={1}
          />
        )}

        {series.map((s, si) => {
          const color = s.color ?? categoricalColor(si);
          const path = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.value)}`).join(' ');
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {hoverIdx !== null && s.points[hoverIdx] && (
                <circle cx={xFor(hoverIdx)} cy={yFor(s.points[hoverIdx].value)} r={4} fill={color} stroke={CHART_CHROME.surface} strokeWidth={2} />
              )}
            </g>
          );
        })}

        <rect
          x={PADDING.left} y={PADDING.top} width={innerWidth} height={innerHeight}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIdx(null)}
        />
      </svg>

      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-1 px-2">
          {series.map((s, si) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: s.color ?? categoricalColor(si) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {hoverIdx !== null && (
        <div className="absolute top-1 right-1 bg-white border border-gray-200 rounded-md shadow-md px-2 py-1.5 text-xs pointer-events-none space-y-0.5">
          <p className="text-gray-500">{fmtDateShort(dates[hoverIdx])}</p>
          {series.map((s, si) => (
            <p key={s.label} className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-0.5 rounded" style={{ backgroundColor: s.color ?? categoricalColor(si) }} />
              <span className="font-semibold text-gray-900">{valueFormat(s.points[hoverIdx]?.value ?? 0)}</span>
              <span className="text-gray-500">{s.label}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

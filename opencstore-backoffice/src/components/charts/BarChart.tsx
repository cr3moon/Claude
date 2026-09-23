import React, { useState } from 'react';
import { CHART_CHROME, categoricalColor, NEUTRAL_COLOR } from './palette';

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  valueFormat?: (v: number) => string;
  /** true = every bar gets its own categorical color (e.g. Department Sales); false = all bars share one series color. */
  categorical?: boolean;
}

const WIDTH = 640;
const PADDING = { top: 12, right: 12, bottom: 36, left: 48 };
const BAR_GAP = 2;
const MAX_BAR_WIDTH = 24;

function niceMax(max: number): number {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Rounded top corners, square baseline — per the dataviz skill's bar/column mark spec. */
function barPath(x: number, yTop: number, width: number, yBottom: number, radius: number): string {
  const r = Math.min(radius, width / 2, Math.max(0, yBottom - yTop));
  return `M${x},${yBottom} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + width - r},${yTop} Q${x + width},${yTop} ${x + width},${yTop + r} L${x + width},${yBottom} Z`;
}

export default function BarChart({ data, height = 220, valueFormat = String, categorical = false }: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;
  const maxValue = niceMax(Math.max(0, ...data.map(d => d.value)));
  const slot = data.length > 0 ? innerWidth / data.length : innerWidth;
  const barWidth = Math.min(MAX_BAR_WIDTH, slot - BAR_GAP);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxValue * f));
  // Thin the X labels once there isn't room for one per bar — matches LineChart's tick spacing.
  const tickEvery = Math.max(1, Math.ceil(data.length / 8));

  if (data.length === 0) {
    return <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>No data for this period.</div>;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img">
        {yTicks.map((t, i) => {
          const y = PADDING.top + innerHeight - (t / maxValue) * innerHeight;
          return (
            <g key={i}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} stroke={CHART_CHROME.gridline} strokeWidth={1} />
              <text x={PADDING.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill={CHART_CHROME.mutedInk}>
                {t.toLocaleString()}
              </text>
            </g>
          );
        })}
        <line
          x1={PADDING.left} x2={WIDTH - PADDING.right}
          y1={PADDING.top + innerHeight} y2={PADDING.top + innerHeight}
          stroke={CHART_CHROME.baseline} strokeWidth={1}
        />
        {data.map((d, i) => {
          const x = PADDING.left + i * slot + (slot - barWidth) / 2;
          const barHeight = maxValue > 0 ? (d.value / maxValue) * innerHeight : 0;
          const yTop = PADDING.top + innerHeight - barHeight;
          const color = d.color ?? (categorical ? (d.label === 'Other' ? NEUTRAL_COLOR : categoricalColor(i)) : categoricalColor(0));
          return (
            <g
              key={d.label + i}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered(h => (h === i ? null : h))}
              style={{ cursor: 'pointer' }}
            >
              <rect x={x - 4} y={PADDING.top} width={barWidth + 8} height={innerHeight} fill="transparent" />
              <path
                d={barPath(x, yTop, barWidth, PADDING.top + innerHeight, 4)}
                fill={color}
                opacity={hovered === null || hovered === i ? 1 : 0.55}
              />
              {i % tickEvery === 0 && (
                <text
                  x={x + barWidth / 2} y={PADDING.top + innerHeight + 14}
                  textAnchor="middle" fontSize={8} fill={CHART_CHROME.mutedInk}
                >
                  {d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered !== null && (
        <div className="absolute top-1 right-1 bg-white border border-gray-200 rounded-md shadow-md px-2 py-1 text-xs pointer-events-none">
          <span className="text-gray-500">{data[hovered].label}</span>{' '}
          <span className="font-semibold text-gray-900">{valueFormat(data[hovered].value)}</span>
        </div>
      )}
    </div>
  );
}

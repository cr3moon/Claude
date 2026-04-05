import React from 'react';

type Variant = 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'purple';

interface StatusBadgeProps {
  label:    string;
  variant?: Variant;
  /** Auto-detect variant from common status strings when variant is omitted */
  status?:  string;
  dot?:     boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  green:  'bg-green-50   text-green-700  border-green-200',
  yellow: 'bg-yellow-50  text-yellow-700 border-yellow-200',
  red:    'bg-red-50     text-red-700    border-red-200',
  blue:   'bg-blue-50    text-blue-700   border-blue-200',
  gray:   'bg-gray-100   text-gray-600   border-gray-200',
  purple: 'bg-purple-50  text-purple-700 border-purple-200',
};

const DOT_CLASSES: Record<Variant, string> = {
  green:  'bg-green-500',
  yellow: 'bg-yellow-500',
  red:    'bg-red-500',
  blue:   'bg-blue-500',
  gray:   'bg-gray-400',
  purple: 'bg-purple-500',
};

function statusToVariant(status: string): Variant {
  const s = status.toLowerCase();
  if (['approved', 'complete', 'success', 'applied', 'ok'].includes(s)) return 'green';
  if (['pending', 'running', 'in_progress'].includes(s))               return 'yellow';
  if (['rejected', 'failed', 'error'].includes(s))                     return 'red';
  if (['mocked', 'placeholder', 'demo'].includes(s))                   return 'purple';
  if (['manual_review', 'warning'].includes(s))                        return 'yellow';
  return 'gray';
}

export default function StatusBadge({ label, variant, status, dot = false }: StatusBadgeProps) {
  const v = variant ?? (status ? statusToVariant(status) : 'gray');
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${VARIANT_CLASSES[v]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLASSES[v]}`} />}
      {label}
    </span>
  );
}

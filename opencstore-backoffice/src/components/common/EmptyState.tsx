import React from 'react';

interface EmptyStateProps {
  title:       string;
  description?: string;
  action?:     React.ReactNode;
  icon?:       React.ReactNode;
}

export default function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="mb-4 text-gray-300 text-5xl" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-gray-800 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

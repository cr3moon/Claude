import React from 'react';

interface PageHeaderProps {
  title:       string;
  subtitle?:   string;
  actions?:    React.ReactNode;
  breadcrumb?: string;
}

export default function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        {breadcrumb && (
          <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wide">{breadcrumb}</p>
        )}
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 ml-4">{actions}</div>}
    </div>
  );
}

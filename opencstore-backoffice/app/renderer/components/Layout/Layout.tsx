import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';

const NAV_ITEMS = [
  { to: '/dashboard',  icon: '📊', label: 'Dashboard' },
  { to: '/imports',    icon: '📥', label: 'Data Import' },
  { to: '/item-audit', icon: '🔍', label: 'Item Audit' },
  { to: '/pricing',    icon: '💲', label: 'Pricing' },
  { to: '/reports',    icon: '📄', label: 'Reports' },
  { to: '/operations', icon: '✅', label: 'Operations' },
  { to: '/settings',   icon: '⚙️', label: 'Settings' },
  { to: '/audit-log',  icon: '🔒', label: 'Audit Log' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="text-base font-bold text-brand-700 leading-tight">OpenCStore</div>
          <div className="text-xs text-gray-500">Back Office</div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User area */}
        <div className="px-4 py-4 border-t border-gray-100">
          {user && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-800 truncate">{user.display_name}</div>
              <div className="text-xs text-gray-400 capitalize">{user.role}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

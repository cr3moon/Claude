import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../modules/auth/AuthContext';
import { can } from '../../modules/auth/roles';
import { StoreAccessService, type AccessibleStore } from '../../modules/stores/store-access.service';

interface NavItem {
  to:    string;
  label: string;
  icon:  string;
  perm?: Parameters<typeof can>[1];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',  label: 'Dashboard',   icon: '▦'  },
  { to: '/transactions', label: 'Transactions', icon: '⎘', perm: 'view_reports' },
  { to: '/items',      label: 'Item Audit',  icon: '✓',  perm: 'view_item_audit' },
  { to: '/pricing',    label: 'Pricing',     icon: '$',  perm: 'view_pricing'    },
  { to: '/imports',    label: 'Imports',     icon: '↑',  perm: 'view_imports'    },
  { to: '/inventory',  label: 'Inventory',   icon: '▧',  perm: 'view_inventory'  },
  { to: '/lottery',    label: 'Lottery',     icon: '★',  perm: 'view_lottery'    },
  { to: '/time-clock', label: 'Time Clock',  icon: '◔',  perm: 'use_time_clock'  },
  { to: '/reports',    label: 'Reports',     icon: '≡',  perm: 'view_reports'    },
  { to: '/operations', label: 'Operations',  icon: '◷',  perm: 'view_operations' },
  { to: '/audit-log',  label: 'Audit Log',   icon: '⊞',  perm: 'view_audit_log'  },
  { to: '/settings',   label: 'Settings',    icon: '⚙',  perm: 'view_settings'   },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [stores, setStores] = useState<AccessibleStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string>('');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    (async () => {
      const accessible = await StoreAccessService.listAccessible();
      setStores(accessible);
      const current = await window.electronAPI.getStore();
      if (current) setActiveStoreId(current.id);
    })();
  }, []);

  const navItems: NavItem[] = stores.length > 1
    ? [...NAV_ITEMS.slice(0, 1), { to: '/multi-store', label: 'All Locations', icon: '⬒' }, ...NAV_ITEMS.slice(1)]
    : NAV_ITEMS;

  const visibleNav = navItems.filter(item =>
    !item.perm || (user ? can(user.role, item.perm) : false)
  );

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function handleSwitchStore(storeId: string) {
    if (storeId === activeStoreId) return;
    setSwitching(true);
    try {
      await StoreAccessService.switchActive(storeId);
      // Every page's data is scoped by the main process's active-store
      // session variable, already loaded into each page's own component
      // state — a full reload is the simplest way to make every page
      // re-fetch under the new store rather than building a cross-page
      // invalidation mechanism for a rarely-used action.
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-gray-900 text-gray-100 transition-all duration-200 ${
          collapsed ? 'w-14' : 'w-52'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-gray-700">
          <span className="text-lg font-bold text-white select-none">⛽</span>
          {!collapsed && (
            <span className="text-sm font-semibold text-white truncate">OpenCStore</span>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="ml-auto text-gray-400 hover:text-white text-xs"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Store switcher — only shown when there's more than one accessible store */}
        {!collapsed && stores.length > 1 && (
          <div className="px-3 py-2 border-b border-gray-700">
            <select
              className="w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700"
              value={activeStoreId}
              disabled={switching}
              onChange={e => handleSwitchStore(e.target.value)}
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.isHome ? ' (home)' : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {visibleNav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-gray-700 px-3 py-3">
          {!collapsed && user && (
            <p className="text-xs text-gray-400 truncate mb-1">{user.display_name}</p>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <span>⏻</span>
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

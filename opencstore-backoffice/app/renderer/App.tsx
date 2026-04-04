import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout/Layout';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import LoginPage from './components/Onboarding/LoginPage';
import Dashboard from './components/Dashboard/Dashboard';
import ImportsPage from './components/Imports/ImportsPage';
import ItemAuditPage from './components/ItemAudit/ItemAuditPage';
import PricingPage from './components/Pricing/PricingPage';
import ReportsPage from './components/Reports/ReportsPage';
import OperationsPage from './components/Operations/OperationsPage';
import SettingsPage from './components/Settings/SettingsPage';
import AuditLogPage from './components/AuditLog/AuditLogPage';

// ─── Auth Context ─────────────────────────────────────────────────────────────

interface User {
  id: string;
  display_name: string;
  role: 'owner' | 'manager' | 'cashier';
  store_id: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => undefined,
  logout: async () => undefined,
});

export const useAuth = () => useContext(AuthContext);

// ─── App ──────────────────────────────────────────────────────────────────────

type AppMode = 'loading' | 'onboarding' | 'login' | 'app';

export default function App() {
  const [mode, setMode] = useState<AppMode>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    window.electronAPI.getState().then((state: { onboardingComplete: boolean; activeUserId: string | null }) => {
      if (!state.onboardingComplete) {
        setMode('onboarding');
      } else if (!state.activeUserId) {
        setMode('login');
      } else {
        setMode('app');
      }
    });
  }, []);

  const logout = async () => {
    await window.electronAPI.logout();
    setUser(null);
    setMode('login');
  };

  if (mode === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-2xl font-bold text-brand-600 mb-2">OpenCStore Back Office</div>
          <div className="text-gray-500">Loading…</div>
        </div>
      </div>
    );
  }

  if (mode === 'onboarding') {
    return (
      <OnboardingWizard onComplete={(u: User) => {
        setUser(u);
        setMode('app');
      }} />
    );
  }

  if (mode === 'login') {
    return (
      <LoginPage onLogin={(u: User) => {
        setUser(u);
        setMode('app');
      }} />
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="imports"    element={<ImportsPage />} />
          <Route path="item-audit" element={<ItemAuditPage />} />
          <Route path="pricing"    element={<PricingPage />} />
          <Route path="reports"    element={<ReportsPage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="settings"   element={<SettingsPage />} />
          <Route path="audit-log"  element={<AuditLogPage />} />
        </Route>
      </Routes>
    </AuthContext.Provider>
  );
}

// ─── Global type augmentation for electronAPI ─────────────────────────────────

declare global {
  interface Window {
    electronAPI: {
      getState:            ()                             => Promise<{ onboardingComplete: boolean; activeUserId: string | null; version: string }>;
      login:               (u: string, p: string)        => Promise<{ success: boolean; user?: User; error?: string }>;
      logout:              ()                             => Promise<{ success: boolean }>;
      completeOnboarding:  (payload: unknown)             => Promise<{ success: boolean; storeId: string; userId: string }>;
      getDashboardSummary: ()                             => Promise<Record<string, unknown>>;
      getStore:            ()                             => Promise<Record<string, unknown>>;
      runMockImport:       ()                             => Promise<Record<string, unknown>>;
      importFromFile:      (f: string, fmt: string)       => Promise<Record<string, unknown>>;
      getImportHistory:    ()                             => Promise<unknown[]>;
      openFileDialog:      ()                             => Promise<{ canceled: boolean; filePaths: string[] }>;
      getItems:            (opts: unknown)                => Promise<{ items: unknown[]; total: number }>;
      getDepartments:      ()                             => Promise<unknown[]>;
      getCategories:       ()                             => Promise<unknown[]>;
      runItemAudit:        ()                             => Promise<Record<string, unknown>>;
      getPendingItemRecs:  (jobRunId?: string)            => Promise<unknown[]>;
      approveItemRec:      (id: string, notes?: string)  => Promise<{ success: boolean }>;
      rejectItemRec:       (id: string, notes?: string)  => Promise<{ success: boolean }>;
      runPricingAnalysis:  ()                             => Promise<Record<string, unknown>>;
      getPendingPriceRecs: (jobRunId?: string)            => Promise<unknown[]>;
      approvePriceRec:     (id: string, notes?: string)  => Promise<{ success: boolean }>;
      rejectPriceRec:      (id: string, notes?: string)  => Promise<{ success: boolean }>;
      exportApprovedPrices:()                             => Promise<Record<string, unknown>>;
      generateReport:      (params: unknown)              => Promise<Record<string, unknown>>;
      getReportArchive:    ()                             => Promise<unknown[]>;
      getReportById:       (id: string)                  => Promise<unknown>;
      createChecklist:     (payload: unknown)             => Promise<Record<string, unknown>>;
      getChecklist:        (id: string)                  => Promise<Record<string, unknown>>;
      completeStep:        (payload: unknown)             => Promise<{ success: boolean }>;
      finalizeChecklist:   (payload: unknown)             => Promise<{ success: boolean }>;
      getChecklistHistory: ()                             => Promise<unknown[]>;
      getAuditLog:         (opts?: unknown)               => Promise<unknown[]>;
      openPath:            (p: string)                   => Promise<void>;
      showInFolder:        (p: string)                   => Promise<void>;
    };
  }
}

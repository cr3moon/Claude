import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/Layout/AppShell';
import { useAuth } from './modules/auth/AuthContext';

// Lazy-loaded pages
const DashboardPage   = lazy(() => import('./pages/DashboardPage'));
const OnboardingPage  = lazy(() => import('./pages/OnboardingPage'));
const ImportsPage     = lazy(() => import('./pages/ImportsPage'));
const InventoryPage   = lazy(() => import('./pages/InventoryPage'));
const LotteryPage     = lazy(() => import('./pages/LotteryPage'));
const TimeClockPage   = lazy(() => import('./pages/TimeClockPage'));
const ItemAuditPage   = lazy(() => import('./pages/ItemAuditPage'));
const PricingPage     = lazy(() => import('./pages/PricingPage'));
const ReportsPage     = lazy(() => import('./pages/ReportsPage'));
const OperationsPage  = lazy(() => import('./pages/OperationsPage'));
const AuditLogPage    = lazy(() => import('./pages/AuditLogPage'));
const SettingsPage    = lazy(() => import('./pages/SettingsPage'));
const LoginPage       = lazy(() => import('./pages/LoginPage'));

function Loading() {
  return <div className="flex items-center justify-center h-full text-gray-400 text-sm animate-pulse">Loading…</div>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, appMode } = useAuth();
  if (appMode === 'loading') return <Loading />;
  if (appMode === 'onboarding') return <Navigate to="/onboarding" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/login"      element={<LoginPage />} />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index              element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"  element={<DashboardPage />} />
          <Route path="/items"      element={<ItemAuditPage />} />
          <Route path="/pricing"    element={<PricingPage />} />
          <Route path="/imports"    element={<ImportsPage />} />
          <Route path="/inventory"  element={<InventoryPage />} />
          <Route path="/lottery"    element={<LotteryPage />} />
          <Route path="/time-clock" element={<TimeClockPage />} />
          <Route path="/reports"    element={<ReportsPage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/audit-log"  element={<AuditLogPage />} />
          <Route path="/settings"   element={<SettingsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

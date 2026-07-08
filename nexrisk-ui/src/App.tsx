// ============================================
// taiga — Main Application
// ============================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/stores/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RoutePermissionGuard } from '@/components/RoutePermissionGuard';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { TermsPage } from '@/pages/legal/TermsPage';
import { DisclosurePage } from '@/pages/legal/DisclosurePage';
import { PrivacyPage } from '@/pages/legal/PrivacyPage';
import { CockpitHelpPage } from './help/CockpitHelpPage';
import HelpPage from './help/ui/HelpPage';

import { Layout } from '@/components/layout';
import {
  CockpitPage,
  PortfolioPage,
  FocusPage,
  BBookPage,
  ABookPage,
  CBookPage,
  NetExposurePage,
  CharterPage,
  ArchetypePage,
  LogsPage,
  LiquidityProvidersPage,
  HedgeRulesPage,
  PriceRulesPage,
  ExecutionReportPage,
  CommandCenterPage,
  FlowHedgingPage,
  BusinessPage,
  // Settings Pages
  SettingsPage,
  // MT5
  NodeManagementPage,
  SymbolMappingPage,
  RouteSanityPage,
  // Admin
  UserManagementPage,
  // Reports
  ReportsPage,
} from '@/pages';

// Predictions — top-level page imported directly (verify whether it's also
// exported from @/pages barrel; if so this direct import can be removed).
import { PredictionsPage } from '@/pages/PredictionsPage';

// Network Cluster — infra world map (provisioned /infra route).
import { NetworkClusterPage } from '@/pages/NetworkClusterPage';

// Settings sub-pages (not in @/pages barrel — direct import)
import { GatewayPage }           from '@/pages/settings/GatewayPage';
import { AuthSessionPage }       from '@/pages/settings/AuthSessionPage';
import { TradingEconomicsPage }  from '@/pages/settings/TradingEconomicsPage';
import { NexDayPage }            from '@/pages/settings/NexDayPage';
import { FixBridgePage }         from '@/pages/settings/FixBridgePage';
import { LogViewerPage }         from '@/pages/settings/LogViewerPage';
import { SecretRotationPage }    from '@/pages/settings/SecretRotationPage';
import { LpListPage }            from '@/pages/settings/LpListPage';
import { LpProfilePage }         from '@/pages/settings/LpProfilePage';
import { AlertingPage }          from '@/pages/settings/AlertingPage';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* ── Public routes — no session required ── */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* ── Legal (public — linked from the auth footer) ── */}
            <Route path="/terms"      element={<TermsPage />} />
            <Route path="/disclosure" element={<DisclosurePage />} />
            <Route path="/privacy"    element={<PrivacyPage />} />

            {/* ── Protected routes — session required ── */}
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              {/* Permission gate — blocks routes whose module is NONE/missing. */}
              <Route element={<RoutePermissionGuard />}>

              {/* ─── Overview ─────────────────────────── */}
              <Route path="/"              element={<CockpitPage />} />
              <Route path="/portfolio"     element={<PortfolioPage />} />
              <Route path="/net-exposure"  element={<NetExposurePage />} />

              {/* ─── Flow ─────────────────────────────── */}
              <Route path="/flow"          element={<FocusPage />} />

              <Route path="/archetypes"    element={<ArchetypePage />} />
              <Route path="/risk-charter"  element={<CharterPage />} />
              <Route path="/predictions"   element={<PredictionsPage />} />

              {/* ─── Execution ────────────────────────── */}
              <Route path="/b-book"              element={<BBookPage />} />
              <Route path="/coverage-book"       element={<CBookPage />} />
              <Route path="/hedging-strategies"  element={<HedgeRulesPage />} />
              <Route path="/execution-report"    element={<ExecutionReportPage />} />

              {/* ─── Markets ──────────────────────────── */}
              <Route path="/liquidity-providers" element={<LiquidityProvidersPage />} />
              <Route path="/symbol-mapping"      element={<SymbolMappingPage />} />
              <Route path="/route-sanity"        element={<RouteSanityPage />} />
              <Route path="/price-rules"         element={<PriceRulesPage />} />

              {/* ─── Control ──────────────────────────── */}
              <Route path="/logs"          element={<LogsPage />} />
              <Route path="/reports"       element={<ReportsPage />} />
              <Route path="/users"         element={<UserManagementPage />} />

              {/* ─── System ───────────────────────────── */}
              <Route path="/mt5-servers"   element={<NodeManagementPage />} />
              <Route path="/infra"         element={<NetworkClusterPage />} />

              {/* ─── Cockpit─────────────────────── */}
              <Route path="/cockpit"      element={<CockpitPage />} />
              <Route path="/cockpit/help" element={<CockpitHelpPage />} />

              {/* ─── Help ─────────────────────────── */}
              <Route path="/help/manual"  element={<HelpPage />} />


              {/* ─── Legacy routes (redirects) ────────── */}
              <Route path="/focus"         element={<Navigate to="/flow" replace />} />
              <Route path="/c-book"        element={<Navigate to="/coverage-book" replace />} />
              <Route path="/charter"       element={<Navigate to="/risk-charter" replace />} />
              <Route path="/archetype"     element={<Navigate to="/archetypes" replace />} />
              <Route path="/hedge-rules"   element={<Navigate to="/hedging-strategies" replace />} />

              {/* ─── Hidden routes (valid but not in nav) */}
              <Route path="/a-book"        element={<ABookPage />} />
              <Route path="/command-center" element={<CommandCenterPage />} />
              <Route path="/flow-hedging"  element={<FlowHedgingPage />} />
              <Route path="/business"      element={<BusinessPage />} />

              {/* ─── Settings ─────────────────────────── */}
              <Route path="/settings"                    element={<SettingsPage />} />
              <Route path="/settings/gateway"            element={<GatewayPage />} />
              <Route path="/settings/auth"               element={<AuthSessionPage />} />
              <Route path="/settings/trading-economics"  element={<TradingEconomicsPage />} />
              <Route path="/settings/nexday"             element={<NexDayPage />} />
              <Route path="/settings/fixbridge"          element={<FixBridgePage />} />
              <Route path="/settings/logs"               element={<LogViewerPage />} />
              <Route path="/settings/rotation"           element={<SecretRotationPage />} />
              <Route path="/settings/lp"                 element={<LpListPage />} />
              <Route path="/settings/lp/:lp_id"          element={<LpProfilePage />} />
              <Route path="/settings/alerts"             element={<AlertingPage />} />

              {/* Legacy 6-box settings routes — redirect to the new hub.
                  Each one will be replaced with a direct route to its new
                  panel as that panel's ticket lands (e.g. /settings/alerts
                  ships → /settings/notifications redirects there instead). */}
              <Route path="/settings/security"      element={<Navigate to="/settings" replace />} />
              <Route path="/settings/connectivity"  element={<Navigate to="/settings" replace />} />
              <Route path="/settings/symbology"     element={<Navigate to="/settings" replace />} />
              <Route path="/settings/audit"         element={<Navigate to="/settings" replace />} />
              <Route path="/settings/notifications" element={<Navigate to="/settings" replace />} />
              <Route path="/settings/risk-logic"    element={<Navigate to="/settings" replace />} />
              </Route>{/* /RoutePermissionGuard */}
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
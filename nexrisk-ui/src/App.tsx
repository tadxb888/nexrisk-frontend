// ============================================
// NexRisk App
// Main application with routing
// ============================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  SecuritySettingsPage,
  ConnectivitySettingsPage,
  SymbologySettingsPage,
  AuditSettingsPage,
  NotificationsSettingsPage,
  RiskLogicSettingsPage,
  // MT5
  NodeManagementPage,
} from '@/pages';

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Main */}
            <Route path="/" element={<CockpitPage />} />
            <Route path="/command-center" element={<CommandCenterPage />} />
            
            {/* RIAN Section */}
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/focus" element={<FocusPage />} />
            <Route path="/b-book" element={<BBookPage />} />
            <Route path="/a-book" element={<ABookPage />} />
            <Route path="/c-book" element={<CBookPage />} />
            <Route path="/net-exposure" element={<NetExposurePage />} />
            <Route path="/flow-hedging" element={<FlowHedgingPage />} />
            <Route path="/business" element={<BusinessPage />} />
            
            {/* Configuration */}
            <Route path="/charter" element={<CharterPage />} />
            <Route path="/archetype" element={<ArchetypePage />} />
            <Route path="/liquidity-providers" element={<LiquidityProvidersPage />} />
            <Route path="/hedge-rules" element={<HedgeRulesPage />} />
            <Route path="/price-rules" element={<PriceRulesPage />} />
            
            {/* Reports */}
            <Route path="/execution-report" element={<ExecutionReportPage />} />
            <Route path="/logs" element={<LogsPage />} />

            {/* MT5 Servers */}
            <Route path="/mt5-servers" element={<NodeManagementPage />} />

            {/* Settings */}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/security" element={<SecuritySettingsPage />} />
            <Route path="/settings/connectivity" element={<ConnectivitySettingsPage />} />
            <Route path="/settings/symbology" element={<SymbologySettingsPage />} />
            <Route path="/settings/audit" element={<AuditSettingsPage />} />
            <Route path="/settings/notifications" element={<NotificationsSettingsPage />} />
            <Route path="/settings/risk-logic" element={<RiskLogicSettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
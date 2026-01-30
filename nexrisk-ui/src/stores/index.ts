// ============================================
// NexRisk State Management (Zustand)
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  UIState, 
  Alert, 
  HealthStatus, 
  UserRole,
  BookType 
} from '@/types';

// ============================================
// UI Store
// ============================================
interface UIStore extends UIState {
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setAlertDrawerOpen: (open: boolean) => void;
  toggleAlertDrawer: () => void;
  setCurrentRole: (role: UserRole) => void;
  setTimeframe: (tf: UIState['timeframe']) => void;
  setBookFilter: (filter: BookType | 'ALL') => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      alertDrawerOpen: true,
      currentRole: 'RISK_OPERATOR',
      timeframe: '1d',
      bookFilter: 'ALL',
      
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setAlertDrawerOpen: (open) => set({ alertDrawerOpen: open }),
      toggleAlertDrawer: () => set((s) => ({ alertDrawerOpen: !s.alertDrawerOpen })),
      setCurrentRole: (role) => set({ currentRole: role }),
      setTimeframe: (tf) => set({ timeframe: tf }),
      setBookFilter: (filter) => set({ bookFilter: filter }),
    }),
    {
      name: 'nexrisk-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        currentRole: state.currentRole,
        timeframe: state.timeframe,
      }),
    }
  )
);

// ============================================
// Alerts Store
// ============================================
interface AlertsStore {
  alerts: Alert[];
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  updateAlert: (id: string, updates: Partial<Alert>) => void;
  removeAlert: (id: string) => void;
  
  // Computed
  pendingCount: number;
  criticalCount: number;
  highCount: number;
}

export const useAlertsStore = create<AlertsStore>((set, get) => ({
  alerts: [],
  
  setAlerts: (alerts) => set({ 
    alerts,
    pendingCount: alerts.filter(a => a.status === 'pending').length,
    criticalCount: alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'pending').length,
    highCount: alerts.filter(a => a.severity === 'HIGH' && a.status === 'pending').length,
  }),
  
  addAlert: (alert) => set((state) => {
    const alerts = [alert, ...state.alerts];
    return {
      alerts,
      pendingCount: alerts.filter(a => a.status === 'pending').length,
      criticalCount: alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'pending').length,
      highCount: alerts.filter(a => a.severity === 'HIGH' && a.status === 'pending').length,
    };
  }),
  
  updateAlert: (id, updates) => set((state) => {
    const alerts = state.alerts.map(a => 
      a.alert_id === id ? { ...a, ...updates } : a
    );
    return {
      alerts,
      pendingCount: alerts.filter(a => a.status === 'pending').length,
      criticalCount: alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'pending').length,
      highCount: alerts.filter(a => a.severity === 'HIGH' && a.status === 'pending').length,
    };
  }),
  
  removeAlert: (id) => set((state) => {
    const alerts = state.alerts.filter(a => a.alert_id !== id);
    return {
      alerts,
      pendingCount: alerts.filter(a => a.status === 'pending').length,
      criticalCount: alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'pending').length,
      highCount: alerts.filter(a => a.severity === 'HIGH' && a.status === 'pending').length,
    };
  }),
  
  pendingCount: 0,
  criticalCount: 0,
  highCount: 0,
}));

// ============================================
// System Store
// ============================================
interface SystemStore {
  health: HealthStatus | null;
  isConnected: boolean;
  lastUpdate: string | null;
  
  setHealth: (health: HealthStatus) => void;
  setConnected: (connected: boolean) => void;
}

export const useSystemStore = create<SystemStore>((set) => ({
  health: null,
  isConnected: false,
  lastUpdate: null,
  
  setHealth: (health) => set({ 
    health, 
    isConnected: health.status === 'healthy',
    lastUpdate: new Date().toISOString(),
  }),
  
  setConnected: (connected) => set({ isConnected: connected }),
}));

// ============================================
// Selection Store (for Focus page etc.)
// ============================================
interface SelectionStore {
  selectedTrader: number | null;
  selectedSymbol: string | null;
  selectedAlert: string | null;
  
  setSelectedTrader: (login: number | null) => void;
  setSelectedSymbol: (symbol: string | null) => void;
  setSelectedAlert: (alertId: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedTrader: null,
  selectedSymbol: null,
  selectedAlert: null,
  
  setSelectedTrader: (login) => set({ selectedTrader: login }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setSelectedAlert: (alertId) => set({ selectedAlert: alertId }),
  clearSelection: () => set({ 
    selectedTrader: null, 
    selectedSymbol: null, 
    selectedAlert: null 
  }),
}));

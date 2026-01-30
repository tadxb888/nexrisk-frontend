// ============================================
// AlertDrawer Component
// Right panel: Critical Risk traders, High Risk Traders, 
// Hedge triggers, Liquidity warnings, LLM explanations
// Collapsible with icon only (no text)
// ============================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { alertsApi } from '@/services/api';
import { useUIStore, useAlertsStore } from '@/stores';
import { clsx } from 'clsx';
import type { Alert, AlertSeverity } from '@/types';

// SVG Icons
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 12L10 8L6 4" />
  </svg>
);

const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M10 12L6 8L10 4" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11.5 4L5.5 10L2.5 7" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M10.5 7.5v4a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h4" />
    <path d="M8 1.5h4.5v4.5" />
    <path d="M6 8l6.5-6.5" />
  </svg>
);

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

const severityOrder: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

interface AlertItemProps {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  onViewTrader: (login: number) => void;
  isAcknowledging: boolean;
}

function AlertItem({ alert, onAcknowledge, onViewTrader, isAcknowledging }: AlertItemProps) {
  const isPending = alert.status === 'pending';

  return (
    <div
      className={clsx(
        'p-3 border-b border-border-muted last:border-b-0',
        isPending ? 'bg-surface' : 'bg-background-secondary opacity-60'
      )}
    >
      {/* Severity indicator - left border */}
      <div className={clsx(
        'flex gap-3',
        alert.severity === 'CRITICAL' && 'border-l-2 border-risk-critical pl-2',
        alert.severity === 'HIGH' && 'border-l-2 border-risk-high pl-2',
        alert.severity === 'MEDIUM' && 'border-l-2 border-risk-medium pl-2',
        alert.severity === 'LOW' && 'border-l-2 border-risk-low pl-2'
      )}>
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('badge text-xs', `badge-${alert.severity.toLowerCase()}`)}>
              {alert.severity}
            </span>
            <span className="text-xs text-text-muted">
              {alert.alert_type.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Message */}
          <p className="text-sm text-text-primary leading-snug mb-2">
            {alert.message.length > 80 
              ? alert.message.slice(0, 80) + '...' 
              : alert.message}
          </p>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-text-muted mb-2">
            <span>{formatRelative(alert.created_at)}</span>
            {alert.trader_login && (
              <span>Trader #{alert.trader_login}</span>
            )}
          </div>

          {/* Actions */}
          {isPending && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onAcknowledge(alert.alert_id)}
                disabled={isAcknowledging}
                className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent-subtle rounded transition-colors"
              >
                <CheckIcon />
                <span>Ack</span>
              </button>
              {alert.trader_login && (
                <button
                  onClick={() => onViewTrader(alert.trader_login)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover rounded transition-colors"
                >
                  <ExternalLinkIcon />
                  <span>View</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AlertSectionProps {
  title: string;
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
  onViewTrader: (login: number) => void;
  isAcknowledging: boolean;
}

function AlertSection({ title, alerts, onAcknowledge, onViewTrader, isAcknowledging }: AlertSectionProps) {
  if (alerts.length === 0) return null;
  
  return (
    <div className="mb-4">
      <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wide bg-background-tertiary border-b border-border-muted">
        {title} ({alerts.length})
      </div>
      {alerts.map((alert) => (
        <AlertItem
          key={alert.alert_id}
          alert={alert}
          onAcknowledge={onAcknowledge}
          onViewTrader={onViewTrader}
          isAcknowledging={isAcknowledging}
        />
      ))}
    </div>
  );
}

export function AlertDrawer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { alertDrawerOpen, toggleAlertDrawer } = useUIStore();
  const { setAlerts } = useAlertsStore();

  // Fetch alerts
  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { status: 'pending', limit: 50 }],
    queryFn: () => alertsApi.getAll({ status: 'pending', limit: 50 }),
    refetchInterval: 10000,
  });

  // Update store when data changes
  if (data?.alerts) {
    setAlerts(data.alerts);
  }

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => alertsApi.acknowledge(alertId, 'current_user'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const handleViewTrader = (login: number) => {
    navigate(`/focus?trader=${login}`);
  };

  const alerts = data?.alerts || [];

  // Group alerts by category as per mockup
  const criticalRiskTraders = alerts.filter(
    a => a.severity === 'CRITICAL' && (a.alert_type === 'CLASSIFICATION_CHANGE' || a.alert_type === 'RISK_THRESHOLD')
  );
  const highRiskTraders = alerts.filter(
    a => a.severity === 'HIGH' && (a.alert_type === 'CLASSIFICATION_CHANGE' || a.alert_type === 'RISK_THRESHOLD')
  );
  const hedgeTriggers = alerts.filter(a => a.alert_type === 'HEDGE_TRIGGER');
  const liquidityWarnings = alerts.filter(a => a.alert_type === 'LIQUIDITY_WARNING');
  const otherAlerts = alerts.filter(
    a => !criticalRiskTraders.includes(a) && !highRiskTraders.includes(a) && 
         !hedgeTriggers.includes(a) && !liquidityWarnings.includes(a)
  );

  if (!alertDrawerOpen) return null;

  return (
    <aside className="w-64 h-full bg-background-secondary border-l border-border flex flex-col shrink-0">
      {/* Header with collapse button - ICON ONLY */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-border shrink-0">
        <span className="font-medium text-text-primary text-sm">Alerts</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{alerts.length} pending</span>
          <button
            onClick={toggleAlertDrawer}
            className="p-1 rounded text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            aria-label="Collapse panel"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      {/* Alert List - grouped by category as per mockup */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-text-muted">Loading...</div>
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted">
            <span className="text-sm">No pending alerts</span>
          </div>
        ) : (
          <>
            <AlertSection
              title="Critical Risk Traders"
              alerts={criticalRiskTraders}
              onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
              onViewTrader={handleViewTrader}
              isAcknowledging={acknowledgeMutation.isPending}
            />
            <AlertSection
              title="High Risk Traders"
              alerts={highRiskTraders}
              onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
              onViewTrader={handleViewTrader}
              isAcknowledging={acknowledgeMutation.isPending}
            />
            <AlertSection
              title="Hedge Triggers"
              alerts={hedgeTriggers}
              onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
              onViewTrader={handleViewTrader}
              isAcknowledging={acknowledgeMutation.isPending}
            />
            <AlertSection
              title="Liquidity Warnings"
              alerts={liquidityWarnings}
              onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
              onViewTrader={handleViewTrader}
              isAcknowledging={acknowledgeMutation.isPending}
            />
            {otherAlerts.length > 0 && (
              <AlertSection
                title="Other Alerts"
                alerts={otherAlerts}
                onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                onViewTrader={handleViewTrader}
                isAcknowledging={acknowledgeMutation.isPending}
              />
            )}
          </>
        )}
      </div>

      {/* Footer - LLM Explanations section */}
      <div className="border-t border-border p-3 shrink-0 bg-background-tertiary">
        <div className="text-xs font-medium text-text-secondary mb-1">LLM Explanations</div>
        <p className="text-xs text-text-muted leading-relaxed">
          AI explanations available for high-risk traders in Focus view.
        </p>
      </div>
    </aside>
  );
}

export default AlertDrawer;

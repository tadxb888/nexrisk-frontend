// ============================================
// NexRisk Type Definitions
// ============================================

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type Classification = 
  | 'SCALPER'
  | 'EA_BOT'
  | 'LATENCY_ARB'
  | 'NEWS_TRADER'
  | 'REBATE_HUNTER'
  | 'MANUAL'
  | 'SWING'
  | 'GRID_MARTINGALE'
  | 'UNKNOWN';

export type AlertStatus = 'pending' | 'acknowledged' | 'resolved';
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertType = 
  | 'CLASSIFICATION_CHANGE'
  | 'RISK_THRESHOLD'
  | 'HEDGE_TRIGGER'
  | 'LIQUIDITY_WARNING'
  | 'SYSTEM_HEALTH';

export type BookType = 'A' | 'B' | 'C';

// Trader types
export interface Trader {
  login: number;
  name: string;
  group: string;
  email?: string;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  classification: Classification;
  risk_score: number;
  risk_level: RiskLevel;
  last_activity_at: string;
}

export interface TraderDashboard {
  trader: {
    login: number;
    name: string;
    group: string;
  };
  account_metrics: {
    balance: number;
    equity: number;
    margin: number;
    margin_free: number;
    margin_level_pct: number;
    unrealized_pnl: number;
  };
  risk_assessment: {
    classification: Classification;
    risk_score: number;
    risk_level: RiskLevel;
    confidence: number;
  };
  trading_stats?: {
    total_trades_24h: number;
    win_rate: number;
    profit_factor: number;
    avg_holding_time_sec: number;
    avg_lot_size: number;
    burst_score: number;
    timing_regularity: number;
  };
  cluster?: {
    cluster_id: number;
    outlier_score: number;
    outlier_category: string;
    is_noise: boolean;
  };
}

// Position types
export interface Position {
  position_id: number;
  login: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  open_price: number;
  current_price?: number;
  profit: number;
  swap: number;
  open_time: string;
}

// Alert types
export interface Alert {
  alert_id: string;
  trader_login: number;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  details?: Record<string, unknown>;
  status: AlertStatus;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

// Health/Stats types
export interface HealthStatus {
  status: string;
  mt5_connected: boolean;
  database_connected: boolean;
  redis_connected: boolean;
  phase2_enabled: boolean;
  phase2c_clustering_enabled: boolean;
  phase4_nexday_enabled: boolean;
  phase5_hybrid_llm_enabled: boolean;
  uptime_seconds: number;
}

export interface SystemStats {
  total_events: number;
  events_processed: number;
  traders_active: number;
  positions_open: number;
  alerts_pending: number;
  uptime_seconds: number;
  events_per_second: number;
}

// Risk Matrix types
export interface RiskMatrixRule {
  rule_id: number;
  behavior_type: Classification;
  profit_factor_min: number;
  profit_factor_max: number;
  risk_level: RiskLevel;
  action_code: string;
  spread_multiplier: number;
  priority: number;
  is_active: boolean;
  description: string;
}

// Portfolio types
export interface PortfolioSummary {
  portfolio: BookMetrics;
  a_book: BookMetrics;
  b_book: BookMetrics;
  c_book: BookMetrics;
  net_total: BookMetrics;
}

export interface BookMetrics {
  net_profit_loss: number;
  floating_profit_loss: number;
  realized_profit_loss: number;
  revenues_per_million: number;
  volumes_lots: number;
  volumes_notional: number;
  revenues_expenses: number;
  swaps: number;
  commissions: number;
  adjustments: number;
  rebates: number;
}

// Explanation types
export interface TraderExplanation {
  login: number;
  current: {
    classification: Classification;
    risk_level: RiskLevel;
    risk_score: number;
    effective_risk: number;
    confidence: number;
    classified_at: string;
    triggered_rules: string;
    template_explanation: string;
  };
  previous_classifications: Array<{
    classification: Classification;
    risk_level: RiskLevel;
    risk_score: number;
    effective_risk: number;
    confidence: number;
    classified_at: string;
  }>;
  claude_explanations: Array<{
    explanation: string;
    generated_at: string;
    for_classification: Classification;
    for_risk_level: RiskLevel;
    for_risk_score: number;
    model: string;
    latency_ms: number;
    cost_usd: number;
    is_stale: boolean;
    stale_reason?: string;
    stale_warning?: string;
  }>;
  explanation_summary: {
    total: number;
    fresh: number;
    stale: number;
    has_fresh_explanation: boolean;
  };
  behavior_change?: {
    classification_changed: boolean;
    risk_level_changed: boolean;
    previous_classification?: Classification;
    previous_risk_level?: RiskLevel;
    trend: 'INCREASING_RISK' | 'DECREASING_RISK' | 'STABLE' | 'NEW_TRADER';
  };
  actions: {
    show_explain_button: boolean;
    explanation_pending: boolean;
    can_generate: boolean;
  };
  has_claude_explanation: boolean;
}

// LLM Status
export interface LLMStatus {
  claude: {
    available: boolean;
    initialized: boolean;
    circuit_state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    stats: {
      total_requests: number;
      successful_requests: number;
      failed_requests: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
      avg_latency_ms: number;
    };
  };
  ollama: {
    available: boolean;
    initialized: boolean;
    model: string;
  };
}

// Clustering types
export interface ClusteringRun {
  run_id: string;
  started_at: string;
  completed_at?: string;
  n_clusters: number;
  n_noise_points: number;
  n_outliers_high: number;
  n_outliers_medium: number;
  execution_time_ms: number;
  universe_size: number;
  status: 'running' | 'completed' | 'failed';
}

export interface TraderClusterAssignment {
  found: boolean;
  trader_login: number;
  cluster_id: number;
  outlier_score: number;
  outlier_category: 'NORMAL' | 'MEDIUM_OUTLIER' | 'HIGH_OUTLIER';
  is_high_outlier: boolean;
  is_medium_outlier: boolean;
}

// Event types
export interface TradeEvent {
  id: number;
  trader_login: number;
  event_type: string;
  symbol: string;
  volume: number;
  price: number;
  profit?: number;
  timestamp: string;
}

// UI State types
export interface UIState {
  sidebarCollapsed: boolean;
  alertDrawerOpen: boolean;
  currentRole: UserRole;
  timeframe: '5m' | '15m' | '1h' | '1d';
  bookFilter: BookType | 'ALL';
}

export type UserRole = 
  | 'EXECUTIVE'
  | 'RISK_OPERATOR'
  | 'RISK_ADMIN'
  | 'IT_OBSERVER';

// API Response wrappers
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AlertsResponse {
  alerts: Alert[];
  total: number;
}

export interface TradersResponse {
  traders: Trader[];
  total: number;
  limit: number;
  offset: number;
}

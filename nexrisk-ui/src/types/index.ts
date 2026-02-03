// ============================================
// NexRisk Type Definitions
// Risk Intelligence Center Types
// ============================================

// ============================================
// Clustering Types
// ============================================

export interface ClusteringRun {
  run_id: string;
  started_at: string;
  completed_at?: string;
  n_clusters: number;
  n_noise_points?: number;
  n_outliers_high?: number;
  n_outliers_medium?: number;
  execution_time_ms?: number;
  universe_size: number;
  status: 'running' | 'completed' | 'failed';
}

export interface ClusteringRunDetail extends ClusteringRun {
  assignments: ClusterAssignment[];
}

export interface ClusterAssignment {
  trader_login: number;
  cluster_id: number;
  outlier_score: number;
  outlier_category: 'NORMAL' | 'MEDIUM' | 'HIGH';
  archetype_code?: string;
}

export interface ClusterProfile {
  cluster_id: number;
  member_count: number;
  status: 'EMERGING' | 'ESTABLISHED' | 'DECLINING';
  label_hint: string;
  archetype_id?: number;
  archetype_code?: string;
  archetype_name?: string;
  risk_severity?: number;
  avg_risk_score?: number;
  description?: string;
  members?: number[];
  centroid_features?: Record<string, number>;
}

export interface ClusterArchetype {
  archetype_id: number;
  archetype_code: string;
  display_name: string;
  description: string;
  risk_severity: number;
}

export interface ClusterExplanation {
  behavior_description: string;
  risk_indicators: string[];
  suggested_archetype_id: number;
  suggested_archetype_code: string;
  confidence: number;
  reasoning: string;
}

export interface ClusterExplainResponse {
  run_id: string;
  cluster_id: number;
  member_count: number;
  explanation: ClusterExplanation;
  llm_stats: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
    cost_usd: number;
  };
}

export interface TraderClusterAssignment {
  found: boolean;
  trader_login: number;
  cluster_id: number;
  outlier_score: number;
  outlier_category: 'NORMAL' | 'MEDIUM' | 'HIGH';
  is_high_outlier: boolean;
  is_medium_outlier: boolean;
  thresholds: {
    high: number;
    medium: number;
  };
}

// ============================================
// Explanation Types
// ============================================

export interface TraderExplanation {
  current: {
    risk_level: string;
    risk_score: number;
    effective_risk: number;
    confidence: number;
    classification: string;
    recommended_action: string;
    triggered_rules?: string;
    template_explanation?: string;
  };
  claude_explanations: ClaudeExplanation[];
  actions: {
    show_explain_button: boolean;
    is_stale: boolean;
    can_regenerate: boolean;
  };
  behavior_change?: {
    trend: 'INCREASING_RISK' | 'DECREASING_RISK' | 'STABLE' | 'NEW';
    risk_delta?: number;
    period?: string;
  };
}

export interface ClaudeExplanation {
  explanation: string;
  model: string;
  is_stale: boolean;
  stale_warning?: string;
  generated_at: string;
  tokens?: {
    input: number;
    output: number;
  };
  cost_usd?: number;
}

// ============================================
// Multi-Strategy Types
// ============================================

export interface TraderStrategy {
  strategy_id: string;
  classification: string;
  risk_level: string;
  risk_score: number;
  confidence: number;
  trade_count: number;
  is_toxic: boolean;
  features?: Record<string, number>;
}

export interface TraderStrategiesResponse {
  login: number;
  is_multi_strategy: boolean;
  strategy_count: number;
  strategies: TraderStrategy[];
  toxic_pct?: number;
}

// ============================================
// Risk Intelligence Dashboard Types
// ============================================

export interface RiskSummary {
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  cluster_count: number;
  auto_explained_count: number;
  pending_review_count: number;
}

export interface TraderRiskRow {
  login: number;
  name?: string;
  classification: string;
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  risk_score: number;
  confidence: number;
  recommended_action: string;
  has_explanation: boolean;
  is_multi_strategy: boolean;
  strategies_count?: number;
  toxic_pct?: number;
  cluster_id?: number;
  outlier_score?: number;
}

// ============================================
// Command Center Types
// ============================================

export interface CommandKPIs {
  toxic_flow_unhedged: {
    pct: number;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    threshold: number;
  };
  net_exposure_direction: {
    direction: 'aligned' | 'opposed' | 'neutral';
    alignment_score: number;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
  };
  hedge_efficiency: {
    hedge_cost_usd: number;
    risk_reduced_usd: number;
    ratio: number;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
  };
  risk_concentration: {
    top_1pct_risk_share: number;
    top_1pct_trader_count: number;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
  };
  traders_requiring_review: {
    count: number;
    critical: number;
    high: number;
  };
  symbols_at_critical_exposure: {
    count: number;
    symbols: string[];
  };
  generated_at: string;
}

export interface ReviewQueueTrader {
  login: number;
  name: string;
  group: string;
  balance: number;
  equity: number;
  classification: string;
  risk_level: string;
  risk_score: number;
  has_explanation: boolean;
  explanation_fresh: boolean;
  recommended_action: string;
  requires_urgent_review: boolean;
}

// ============================================
// Portfolio Dashboard Types
// ============================================

export interface BookSummary {
  floating_pnl: number;
  total_equity: number;
  volume_lots: number;
  trader_count: number;
  position_count: number;
  avg_risk_score: number;
}

export interface PortfolioSummary {
  period: string;
  generated_at: string;
  books: {
    a_book: BookSummary;
    b_book: BookSummary;
    unclassified: BookSummary;
  };
  net_total: {
    floating_pnl: number;
    total_equity: number;
    volume_lots: number;
    trader_count: number;
  };
}

export interface PortfolioRatios {
  hedge_ratio_notional: {
    a_book_pct: number;
    b_book_pct: number;
    other_pct: number;
    a_to_b_ratio: number;
  };
  hedge_ratio_toxic_weighted: {
    toxic_flow_hedged_pct: number;
    toxic_flow_unhedged_pct: number;
    a_to_b_toxic_ratio: number;
  };
  b_book_profitability_index: {
    value: number;
    trend: 'improving' | 'declining' | 'stable';
    trend_pct: number;
    period: string;
  };
  generated_at: string;
}

export interface RiskRadarDimension {
  axis: string;
  value: number;
  benchmark: number;
}

export interface RiskRadarData {
  dimensions: RiskRadarDimension[];
  overall_risk_score: number;
  risk_status: 'LOW' | 'MODERATE' | 'ELEVATED' | 'CRITICAL';
  generated_at: string;
}

// ============================================
// Feature Types (for fallback metrics)
// ============================================

export interface TraderFeatures {
  login: number;
  window: string;
  features: {
    // Timing features
    avg_hold_seconds?: number;
    timing_regularity?: number;
    time_of_day_entropy?: number;
    
    // Performance features
    win_rate?: number;
    profit_factor?: number;
    avg_profit_per_trade?: number;
    sharpe_ratio?: number;
    
    // Behavioral features
    lot_entropy?: number;
    lot_consistency?: number;
    burst_score?: number;
    burst_frequency?: number;
    
    // Risk features
    max_drawdown?: number;
    volatility?: number;
    var_95?: number;
    
    // Trading style
    trade_count?: number;
    avg_lot_size?: number;
    symbol_diversity?: number;
  };
}

// ============================================
// Re-export existing types
// ============================================

export interface Trader {
  login: number;
  name?: string;
  group?: string;
  balance?: number;
  equity?: number;
  margin_level?: number;
  classification?: string;
  risk_level?: string;
  risk_score?: number;
  confidence?: number;
  effective_risk?: number;
  recommended_action?: string;
  has_explanation?: boolean;
  is_multi_strategy?: boolean;
  strategies_count?: number;
}

export interface TradersResponse {
  traders: Trader[];
  total: number;
  page?: number;
  limit?: number;
}

export interface TraderDashboard {
  login: number;
  name?: string;
  group?: string;
  balance: number;
  equity: number;
  margin_level?: number;
  classification: string;
  risk_level: string;
  risk_score: number;
  confidence: number;
  effective_risk: number;
  recommended_action: string;
  position_count: number;
  open_pnl: number;
  today_pnl: number;
}

export interface Position {
  ticket: number;
  login: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  open_price: number;
  current_price: number;
  profit: number;
  open_time: string;
  sl?: number;
  tp?: number;
}

export interface Alert {
  alert_id: string;
  trader_login: number;
  alert_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED' | 'EXPIRED';
  title: string;
  message: string;
  created_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
}

export interface AlertsResponse {
  alerts: Alert[];
  total: number;
}

export interface HealthStatus {
  status: string;
  mt5_connected: boolean;
  database_connected: boolean;
  redis_connected: boolean;
  phase2_enabled: boolean;
  phase2c_clustering_enabled: boolean;
  phase4_nexday_enabled: boolean;
  phase5_hybrid_llm_enabled: boolean;
  phase6_multi_strategy_enabled: boolean;
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

export interface RiskMatrixRule {
  rule_id: number;
  behavior_type: string;
  profit_factor_min?: number;
  profit_factor_max?: number;
  profit_factor_range: string;
  risk_level: string;
  action_code: string;
  spread_multiplier: number;
  description: string;
  is_active: boolean;
}

export interface TradeEvent {
  event_id: string;
  login: number;
  event_type: string;
  symbol?: string;
  ticket?: number;
  volume?: number;
  price?: number;
  profit?: number;
  timestamp: string;
}

export interface LLMStatus {
  claude: {
    available: boolean;
    model: string;
    total_requests: number;
    total_cost_usd: number;
  };
  ollama?: {
    available: boolean;
    model: string;
  };
  template: {
    available: boolean;
  };
  active_provider: string;
}
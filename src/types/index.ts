/**
 * NexRisk BFF Type Definitions
 * These types mirror the C++ API responses and add BFF-specific types
 */

// =============================================================================
// User & Auth Types
// =============================================================================

export type Role = 'exec_readonly' | 'risk_ops' | 'risk_admin' | 'it_observer';

export type Capability =
  | 'traders.read'
  | 'traders.details'
  | 'positions.read'
  | 'orders.read'
  | 'alerts.read'
  | 'alerts.ack'
  | 'alerts.resolve'
  | 'explain.generate'
  | 'clustering.read'
  | 'clustering.run'
  | 'risk_matrix.read'
  | 'risk_matrix.write'
  | 'config.read'
  | 'config.write'
  | 'predictions.read'
  | 'llm.status';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  capabilities: Capability[];
}

// =============================================================================
// Trader Types
// =============================================================================

export type Classification =
  | 'MANUAL'
  | 'SCALPER'
  | 'EA_BOT'
  | 'ARBITRAGE'
  | 'NEWS_TRADER'
  | 'REBATE_ABUSE'
  | 'UNKNOWN';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Trader {
  login: number;
  name: string;
  group: string;
  email?: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  classification: Classification;
  riskScore: number;
  lastActivityAt?: string;
}

export interface TraderDashboard {
  trader: {
    login: number;
    name: string;
    group: string;
  };
  accountMetrics: {
    balance: number;
    equity: number;
    margin: number;
    marginFree: number;
    marginLevelPct: number;
    unrealizedPnl: number;
  };
  riskAssessment: {
    classification: Classification;
    riskScore: number;
    riskLevel: RiskLevel;
  };
  tradingStats?: {
    totalTrades24h: number;
    winRate: number;
    profitFactor: number;
    avgHoldingTimeSec: number;
    avgLotSize: number;
    burstScore: number;
    timingRegularity: number;
  };
  cluster?: {
    clusterId: number;
    outlierScore: number;
    outlierCategory: string;
    isNoise: boolean;
  };
}

// =============================================================================
// Position & Order Types
// =============================================================================

export type PositionType = 'BUY' | 'SELL';
export type OrderType = 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';

export interface Position {
  positionId: number;
  login: number;
  symbol: string;
  type: PositionType;
  volume: number;
  openPrice: number;
  currentPrice?: number;
  profit: number;
  swap?: number;
  openTime: string;
}

export interface Order {
  orderId: number;
  login: number;
  symbol: string;
  type: OrderType;
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  createdAt: string;
}

// =============================================================================
// Alert Types
// =============================================================================

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'pending' | 'acknowledged' | 'resolved';
export type AlertType =
  | 'CLASSIFICATION_CHANGE'
  | 'HIGH_RISK_DETECTED'
  | 'ANOMALY_DETECTED'
  | 'CLUSTER_DRIFT';

export interface Alert {
  alertId: string;
  traderLogin: number;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  details?: Record<string, unknown>;
  status: AlertStatus;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

// =============================================================================
// Explanation Types
// =============================================================================

export type ExplanationProvider = 'claude' | 'ollama' | 'template';

export interface ClaudeExplanation {
  explanation: string;
  generatedAt: string;
  forClassification: Classification;
  forRiskLevel: RiskLevel;
  forRiskScore: number;
  model: string;
  latencyMs: number;
  costUsd: number;
  isStale: boolean;
  staleReason?: string;
  staleWarning?: string;
}

export interface TraderExplanation {
  login: number;
  current: {
    classification: Classification;
    riskLevel: RiskLevel;
    riskScore: number;
    effectiveRisk: number;
    confidence: number;
    classifiedAt: string;
    triggeredRules: string;
    templateExplanation: string;
  };
  previousClassifications: Array<{
    classification: Classification;
    riskLevel: RiskLevel;
    riskScore: number;
    effectiveRisk: number;
    confidence: number;
    classifiedAt: string;
  }>;
  claudeExplanations: ClaudeExplanation[];
  explanationSummary: {
    total: number;
    fresh: number;
    stale: number;
    hasFreshExplanation: boolean;
  };
  behaviorChange?: {
    classificationChanged: boolean;
    riskLevelChanged: boolean;
    previousClassification?: Classification;
    previousRiskLevel?: RiskLevel;
    trend: 'INCREASING_RISK' | 'DECREASING_RISK' | 'STABLE' | 'NEW_TRADER';
  };
  actions: {
    showExplainButton: boolean;
    explanationPending: boolean;
    canGenerate: boolean;
  };
  hasClaudeExplanation: boolean;
}

// =============================================================================
// Clustering Types
// =============================================================================

export type OutlierCategory = 'NORMAL' | 'MEDIUM_OUTLIER' | 'HIGH_OUTLIER';

export interface ClusterAssignment {
  traderLogin: number;
  clusterId: number;
  outlierScore: number;
  outlierCategory: OutlierCategory;
  isHighOutlier: boolean;
  isMediumOutlier: boolean;
}

export interface ClusteringRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  nClusters: number;
  nNoisePoints: number;
  nOutliersHigh: number;
  nOutliersMedium: number;
  executionTimeMs: number;
  universeSize: number;
  status: 'running' | 'completed' | 'failed';
}

// =============================================================================
// WebSocket Types
// =============================================================================

export type WSTopic = 'events' | 'alerts' | 'trader' | 'clustering' | 'health';

export type WSMessageType =
  | 'event'
  | 'subscribe'
  | 'unsubscribe'
  | 'ack'
  | 'error'
  | 'heartbeat';

export interface WSMessage<T = unknown> {
  v: 1;
  type: WSMessageType;
  topic: WSTopic;
  key?: string;
  seq?: number;
  ts: string;
  data?: T;
}

export interface WSSubscription {
  topic: WSTopic;
  key?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiError {
  error: string;
  details?: string;
  code?: string;
}

// =============================================================================
// Health & Status Types
// =============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    nexriskApi: 'healthy' | 'unhealthy';
    claude?: {
      state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
      fallback?: 'ollama' | 'template';
    };
    redis?: 'healthy' | 'unhealthy';
    database?: 'healthy' | 'unhealthy';
  };
  uptime: number;
}

export interface LLMStatus {
  claude: {
    available: boolean;
    initialized: boolean;
    circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    stats: {
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCostUsd: number;
      avgLatencyMs: number;
    };
  };
  ollama: {
    available: boolean;
    initialized: boolean;
    model: string;
  };
}

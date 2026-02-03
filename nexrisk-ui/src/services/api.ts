// ============================================
// NexRisk API Service Layer
// ============================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8090';

// Generic fetch wrapper
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================
// Health & Stats API
// ============================================
export const healthApi = {
  getHealth: () => fetchAPI<import('@/types').HealthStatus>('/health'),
  
  getStats: () => fetchAPI<import('@/types').SystemStats>('/api/v1/stats'),
};

// ============================================
// Traders API
// ============================================
export const tradersApi = {
  getAll: (params?: { 
    limit?: number; 
    offset?: number; 
    group?: string;
    classification?: string;
    risk_level?: string;
    min_risk_score?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.group) searchParams.set('group', params.group);
    if (params?.classification) searchParams.set('classification', params.classification);
    if (params?.risk_level) searchParams.set('risk_level', params.risk_level);
    if (params?.min_risk_score) searchParams.set('min_risk_score', String(params.min_risk_score));
    
    const query = searchParams.toString();
    return fetchAPI<import('@/types').TradersResponse>(
      `/api/v1/traders${query ? `?${query}` : ''}`
    );
  },
  
  getById: (login: number) => 
    fetchAPI<import('@/types').Trader>(`/api/v1/traders/${login}`),
  
  getDashboard: (login: number) => 
    fetchAPI<import('@/types').TraderDashboard>(`/api/v1/traders/${login}/dashboard`),
  
  getHistory: (login: number, params?: { limit?: number; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.type) searchParams.set('type', params.type);
    
    const query = searchParams.toString();
    return fetchAPI<{ login: number; trades: import('@/types').TradeEvent[] }>(
      `/api/v1/traders/${login}/history${query ? `?${query}` : ''}`
    );
  },
  
  getFeatures: (login: number, window: string = '1d') => 
    fetchAPI<{ login: number; window: string; features: Record<string, number> }>(
      `/api/v1/traders/${login}/features?window=${window}`
    ),
    
  getStrategies: (login: number) =>
    fetchAPI<{
      login: number;
      is_multi_strategy: boolean;
      strategy_count: number;
      strategies: Array<{
        strategy_id: string;
        classification: string;
        risk_level: string;
        risk_score: number;
        confidence: number;
        trade_count: number;
        is_toxic: boolean;
      }>;
    }>(`/api/v1/traders/${login}/strategies`),
};

// ============================================
// Positions API
// ============================================
export const positionsApi = {
  getAll: (limit: number = 100) => 
    fetchAPI<{ positions: import('@/types').Position[]; total: number }>(
      `/api/v1/positions?limit=${limit}`
    ),
  
  getByTrader: (login: number) => 
    fetchAPI<{ login: number; positions: import('@/types').Position[]; total: number }>(
      `/api/v1/positions/${login}`
    ),
};

// ============================================
// Orders API
// ============================================
export const ordersApi = {
  getAll: (limit: number = 100) => 
    fetchAPI<{ orders: unknown[]; total: number }>(
      `/api/v1/orders?limit=${limit}`
    ),
  
  getByTrader: (login: number) => 
    fetchAPI<{ login: number; orders: unknown[]; total: number }>(
      `/api/v1/orders/${login}`
    ),
};

// ============================================
// Alerts API
// ============================================
export const alertsApi = {
  getAll: (params?: { limit?: number; status?: string; severity?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.severity) searchParams.set('severity', params.severity);
    
    const query = searchParams.toString();
    return fetchAPI<import('@/types').AlertsResponse>(
      `/api/v1/alerts${query ? `?${query}` : ''}`
    );
  },
  
  getById: (alertId: string) => 
    fetchAPI<import('@/types').Alert>(`/api/v1/alerts/${alertId}`),
  
  acknowledge: (alertId: string, acknowledgedBy: string) => 
    fetchAPI<{ success: boolean }>(`/api/v1/alerts/${alertId}/acknowledge`, {
      method: 'PUT',
      body: JSON.stringify({ acknowledged_by: acknowledgedBy }),
    }),
  
  resolve: (alertId: string, resolvedBy: string, notes?: string) => 
    fetchAPI<{ success: boolean }>(`/api/v1/alerts/${alertId}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ resolved_by: resolvedBy, resolution_notes: notes }),
    }),
};

// ============================================
// Analysis API
// ============================================
export const analysisApi = {
  getTraderAnalysis: (login: number) => 
    fetchAPI<{
      login: number;
      classification: string;
      confidence: number;
      risk_level: string;
      risk_score: number;
      effective_risk: number;
      probabilities: Record<string, number>;
      triggered_rules: string[];
      recommended_action: string;
    }>(`/api/v1/analysis/trader/${login}`),
};

// ============================================
// Config API
// ============================================
export const configApi = {
  getRiskMatrix: (params?: { behavior?: string; active?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.behavior) searchParams.set('behavior', params.behavior);
    if (params?.active !== undefined) searchParams.set('active', String(params.active));
    
    const query = searchParams.toString();
    return fetchAPI<{ rules: import('@/types').RiskMatrixRule[]; total: number }>(
      `/api/v1/config/risk-matrix${query ? `?${query}` : ''}`
    );
  },
  
  lookupRiskMatrix: (behavior: string, profitFactor: number) => 
    fetchAPI<{
      found: boolean;
      rule_id?: number;
      behavior_type?: string;
      profit_factor_range?: string;
      risk_level?: string;
      action_code?: string;
      spread_multiplier?: number;
      description?: string;
    }>(`/api/v1/config/risk-matrix/lookup?behavior=${behavior}&profit_factor=${profitFactor}`),
  
  getActionCodes: () => 
    fetchAPI<{ action_codes: { code: string; description: string; severity: number }[] }>(
      '/api/v1/config/risk-action-codes'
    ),
  
  getModifierFlags: () => 
    fetchAPI<{ flags: { flag_id: number; flag_name: string; risk_modifier: number; description: string }[] }>(
      '/api/v1/config/risk-modifier-flags'
    ),
};

// ============================================
// Explanations API
// ============================================
export const explanationsApi = {
  getTraderExplanation: (login: number) => 
    fetchAPI<import('@/types').TraderExplanation>(`/api/v1/explanations/trader/${login}`),
  
  generateExplanation: (login: number) => 
    fetchAPI<{
      login: number;
      success: boolean;
      provider: string;
      explanation: string;
      model?: string;
      tokens?: { input: number; output: number };
      latency_ms?: number;
      cost_usd?: number;
      fallback_reason?: string;
    }>(`/api/v1/explanations/trader/${login}/generate`, { method: 'POST' }),
  
  getCosts: () => 
    fetchAPI<{
      claude: {
        available: boolean;
        total_requests: number;
        successful_requests: number;
        failed_requests: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_cost_usd: number;
        avg_latency_ms: number;
      };
      endpoint: {
        queued_count: number;
        generated_count: number;
        failed_count: number;
        total_cost_usd: number;
      };
      daily_costs: { date: string; count: number; cost_usd: number; avg_latency_ms: number }[];
    }>('/api/v1/explanations/costs'),
  
  getQueueStatus: () => 
    fetchAPI<{
      queue_size: number;
      workers: number;
      running: boolean;
      stats: { queued_total: number; generated_total: number; failed_total: number };
    }>('/api/v1/explanations/queue'),
    
  enqueue: (data: {
    login: number;
    classification: string;
    risk_level: string;
    risk_score: number;
    confidence: number;
    features_json?: string;
    triggered_rules?: string;
  }) =>
    fetchAPI<{
      success: boolean;
      login: number;
      message: string;
    }>('/api/v1/explanations/enqueue', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ============================================
// LLM API
// ============================================
export const llmApi = {
  getStatus: () => fetchAPI<import('@/types').LLMStatus>('/api/v1/llm/status'),
  
  test: (prompt?: string) => {
    const params = prompt ? `?prompt=${encodeURIComponent(prompt)}` : '';
    return fetchAPI<{
      claude: {
        available: boolean;
        success: boolean;
        model: string;
        response: string;
        latency_ms: number;
        cost_usd: number;
      };
    }>(`/api/v1/llm/test${params}`);
  },
};

// ============================================
// Clustering API
// ============================================
export const clusteringApi = {
  getConfig: () => 
    fetchAPI<{
      min_cluster_size: number;
      min_samples: number;
      cluster_selection_epsilon: number;
      distance_metric: string;
      feature_window: string;
      min_trades_for_clustering: number;
      run_interval_minutes: number;
      min_traders_for_run: number;
      auto_run_enabled: boolean;
      action_threshold: number;
      emerging_cluster_min: number;
      high_outlier_threshold: number;
      medium_outlier_threshold: number;
      store_feature_snapshots: boolean;
      source: string;
    }>('/api/v1/clustering/config'),
  
  updateConfig: (config: Record<string, unknown>) => 
    fetchAPI<{ success: boolean; message: string }>('/api/v1/clustering/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
    
  reloadConfig: () =>
    fetchAPI<{ success: boolean; message: string }>('/api/v1/clustering/config/reload', {
      method: 'POST',
    }),
  
  triggerRun: (sinceHours?: number) => 
    fetchAPI<import('@/types').ClusteringRun>('/api/v1/clustering/run', {
      method: 'POST',
      body: JSON.stringify(sinceHours ? { since_hours: sinceHours } : {}),
    }),
  
  getRuns: (limit: number = 10) => 
    fetchAPI<{ runs: import('@/types').ClusteringRun[] }>(
      `/api/v1/clustering/runs?limit=${limit}`
    ),
  
  getRunById: (runId: string) => 
    fetchAPI<import('@/types').ClusteringRunDetail>(
      `/api/v1/clustering/runs/${runId}`
    ),
    
  deleteRun: (runId: string) =>
    fetchAPI<{ success: boolean; deleted_run_id: string }>(
      `/api/v1/clustering/runs/${runId}`,
      { method: 'DELETE' }
    ),
    
  getRunProfiles: (runId: string) =>
    fetchAPI<{
      run_id: string;
      profiles: Array<{
        cluster_id: number;
        member_count: number;
        status: string;
        label_hint: string;
        archetype_id?: number;
        archetype_code?: string;
      }>;
    }>(`/api/v1/clustering/runs/${runId}/profiles`),
  
  getTraderCluster: (login: number) => 
    fetchAPI<import('@/types').TraderClusterAssignment>(
      `/api/v1/clustering/traders/${login}`
    ),
  
  getOutliers: () => 
    fetchAPI<{
      run_id: string;
      threshold: number;
      count: number;
      outliers: { trader_login: number; outlier_score: number }[];
    }>('/api/v1/clustering/outliers'),
    
  getArchetypes: () =>
    fetchAPI<{
      archetypes: Array<{
        archetype_id: number;
        archetype_code: string;
        display_name: string;
        description: string;
        risk_severity: number;
      }>;
      count: number;
    }>('/api/v1/clustering/archetypes'),
    
  setClusterArchetype: (runId: string, clusterId: number, archetypeId: number, mappedBy?: string) =>
    fetchAPI<{ success: boolean }>(
      `/api/v1/clustering/runs/${runId}/clusters/${clusterId}/archetype`,
      {
        method: 'PUT',
        body: JSON.stringify({ archetype_id: archetypeId, mapped_by: mappedBy }),
      }
    ),
    
  explainCluster: (runId: string, clusterId: number) =>
    fetchAPI<{
      run_id: string;
      cluster_id: number;
      member_count: number;
      explanation: {
        behavior_description: string;
        risk_indicators: string[];
        suggested_archetype_id: number;
        suggested_archetype_code: string;
        confidence: number;
        reasoning: string;
      };
      llm_stats: {
        model: string;
        input_tokens: number;
        output_tokens: number;
        latency_ms: number;
        cost_usd: number;
      };
    }>(`/api/v1/clustering/runs/${runId}/clusters/${clusterId}/explain`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    
  detectDrift: (baselineRunId: string, currentRunId: string) =>
    fetchAPI<{
      alert_count: number;
      alerts: Array<{
        drift_type: string;
        cluster_id: number;
        severity: string;
      }>;
    }>('/api/v1/clustering/drift/detect', {
      method: 'POST',
      body: JSON.stringify({
        baseline_run_id: baselineRunId,
        current_run_id: currentRunId,
      }),
    }),
};

// ============================================
// Events API
// ============================================
export const eventsApi = {
  getRecent: (params?: { limit?: number; login?: number; type?: string; since?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.login) searchParams.set('login', String(params.login));
    if (params?.type) searchParams.set('type', params.type);
    if (params?.since) searchParams.set('since', params.since);
    
    const query = searchParams.toString();
    return fetchAPI<{ events: import('@/types').TradeEvent[]; total: number }>(
      `/api/v1/events${query ? `?${query}` : ''}`
    );
  },
};

// ============================================
// Symbols API
// ============================================
export const symbolsApi = {
  getAll: () => 
    fetchAPI<{
      symbols: {
        symbol: string;
        description: string;
        digits: number;
        contract_size: number;
        spread: number;
        trade_mode: string;
      }[];
      total: number;
    }>('/api/v1/symbols'),
};

// ============================================
// Groups API
// ============================================
export const groupsApi = {
  getAll: () => 
    fetchAPI<{
      groups: {
        name: string;
        leverage: number;
        margin_call: number;
        stop_out: number;
      }[];
      total: number;
    }>('/api/v1/groups'),
};

// ============================================
// Command Center API (Dashboard)
// ============================================
export const commandApi = {
  getKPIs: () =>
    fetchAPI<{
      toxic_flow_unhedged: {
        pct: number;
        status: string;
        threshold: number;
      };
      net_exposure_direction: {
        direction: string;
        alignment_score: number;
        status: string;
        note?: string;
      };
      hedge_efficiency: {
        hedge_cost_usd: number;
        risk_reduced_usd: number;
        ratio: number;
        status: string;
        note?: string;
      };
      risk_concentration: {
        top_1pct_risk_share: number;
        top_1pct_trader_count: number;
        status: string;
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
    }>('/api/v1/command/kpis'),
    
  getReviewQueue: (limit: number = 20) =>
    fetchAPI<{
      traders: Array<{
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
      }>;
      total: number;
    }>(`/api/v1/command/review-queue?limit=${limit}`),
};

// ============================================
// Portfolio API (Dashboard)
// ============================================
export const portfolioApi = {
  getSummary: (period: string = 'today') =>
    fetchAPI<{
      period: string;
      generated_at: string;
      books: {
        a_book: {
          floating_pnl: number;
          total_equity: number;
          volume_lots: number;
          trader_count: number;
          position_count: number;
          avg_risk_score: number;
        };
        b_book: {
          floating_pnl: number;
          total_equity: number;
          volume_lots: number;
          trader_count: number;
          position_count: number;
          avg_risk_score: number;
        };
        unclassified: {
          floating_pnl: number;
          total_equity: number;
          volume_lots: number;
          trader_count: number;
          position_count: number;
          avg_risk_score: number;
        };
      };
      net_total: {
        floating_pnl: number;
        total_equity: number;
        volume_lots: number;
        trader_count: number;
      };
    }>(`/api/v1/portfolio/summary?period=${period}`),
    
  getRatios: () =>
    fetchAPI<{
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
        trend: string;
        trend_pct: number;
        period: string;
        note?: string;
      };
      generated_at: string;
    }>('/api/v1/portfolio/ratios'),
    
  getRiskRadar: () =>
    fetchAPI<{
      dimensions: Array<{
        axis: string;
        value: number;
        benchmark: number;
      }>;
      overall_risk_score: number;
      risk_status: string;
      generated_at: string;
    }>('/api/v1/portfolio/risk-radar'),
};
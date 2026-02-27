// ============================================
// NexRisk API Service Layer
// ============================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Generic fetch wrapper
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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
  getAll: (params?: { limit?: number; offset?: number; group?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.group) searchParams.set('group', params.group);
    
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
    fetchAPI<Record<string, unknown>>('/api/v1/clustering/config'),
  
  updateConfig: (config: Record<string, unknown>) => 
    fetchAPI<{ success: boolean; message: string }>('/api/v1/clustering/config', {
      method: 'PUT',
      body: JSON.stringify(config),
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
    fetchAPI<import('@/types').ClusteringRun & { assignments: unknown[] }>(
      `/api/v1/clustering/runs/${runId}`
    ),
  
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
      archetypes: {
        archetype_id: number;
        archetype_code: string;
        display_name: string;
        description: string;
        risk_severity: number;
      }[];
      count: number;
    }>('/api/v1/clustering/archetypes'),

  getRunProfiles: (runId: string) =>
    fetchAPI<{
      run_id: string;
      profiles: {
        cluster_id: number;
        member_count: number;
        status: string;
        label_hint: string;
        mapped_archetype?: string;
        mapped_archetype_id?: number;
      }[];
    }>(`/api/v1/clustering/runs/${runId}/profiles`),

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

  mapArchetype: (runId: string, clusterId: number, archetypeId: number, mappedBy: string) =>
    fetchAPI<{ success: boolean }>(
      `/api/v1/clustering/runs/${runId}/clusters/${clusterId}/archetype`,
      {
        method: 'PUT',
        body: JSON.stringify({ archetype_id: archetypeId, mapped_by: mappedBy }),
      }
    ),

  deleteRun: (runId: string) =>
    fetchAPI<{ success: boolean; deleted_run_id: string }>(
      `/api/v1/clustering/runs/${runId}`,
      { method: 'DELETE' }
    ),  
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
// MT5 Node & Book Management API
// ============================================

export interface MT5NodeAPI {
  id: number;
  node_name: string;
  node_type: string;
  server_address: string;
  manager_login: number;
  pump_flags: string[];
  groups_filter: string[];
  reconnect_interval_sec: number;
  heartbeat_interval_sec: number;
  is_enabled: boolean;
  is_master: boolean;
  connection_status: string;
  last_connected_at: string;
  last_error: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  has_password: boolean;
}

export interface MT5GroupAPI {
  group: string;
  company: string;
  currency: string;
  currency_digits: number;
  margin_mode: number;
  margin_call: number;
  margin_stopout: number;
  leverage: number;
  limit_orders: number;
  limit_positions: number;
  trade_flags: number;
}

export interface BookAssignmentAPI {
  assignment_id: number;
  group_name: string;
  description: string;
  assigned_by: string;
  created_at: string;
}

export interface NodeBookAPI {
  book_name: string;
  display_name: string;
  color_hex: string;
  group_count: number;
  groups: BookAssignmentAPI[];
}

export const mt5Api = {
  // ── Node Registry ──────────────────────────────────────────
  getNodes: () =>
    fetchAPI<{ nodes: MT5NodeAPI[]; total: number; connected_count: number; generated_at: string }>(
      '/api/v1/mt5/nodes'
    ),

  getNodeStatus: () =>
    fetchAPI<{
      nodes: {
        node_id: number;
        node_name: string;
        node_type: string;
        is_master: boolean;
        is_enabled: boolean;
        connection_status: string;
        last_connected_at: string;
        last_error: string;
      }[];
      total: number;
      connected_count: number;
      primary_connected: boolean;
      generated_at: string;
    }>('/api/v1/mt5/nodes/status'),

  getNode: (id: number) =>
    fetchAPI<MT5NodeAPI>(`/api/v1/mt5/nodes/${id}`),

  createNode: (data: {
    node_name: string;
    node_type: string;
    server_address: string;
    manager_login: number;
    password: string;
    pump_flags?: string[];
    groups_filter?: string[];
    reconnect_interval_sec?: number;
    heartbeat_interval_sec?: number;
    is_enabled?: boolean;
    is_master?: boolean;
    created_by?: string;
    auto_connect?: boolean;
  }) =>
    fetchAPI<{ success: boolean; message: string; node: Partial<MT5NodeAPI> }>(
      '/api/v1/mt5/nodes',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  updateNode: (id: number, data: Partial<{
    node_name: string;
    node_type: string;
    server_address: string;
    manager_login: number;
    password: string;
    pump_flags: string[];
    groups_filter: string[];
    reconnect_interval_sec: number;
    heartbeat_interval_sec: number;
    is_enabled: boolean;
    is_master: boolean;
  }>) =>
    fetchAPI<{ success: boolean; message: string; node: MT5NodeAPI; restart_required?: boolean }>(
      `/api/v1/mt5/nodes/${id}`,
      { method: 'PUT', body: JSON.stringify(data) }
    ),

  deleteNode: (id: number) =>
    fetchAPI<{ success: boolean; message: string; deleted_id: number; deleted_name: string }>(
      `/api/v1/mt5/nodes/${id}`,
      { method: 'DELETE' }
    ),

  connectNode: (id: number) =>
    fetchAPI<{ success: boolean; node_id: number; message: string; connection_status: string; last_error: string }>(
      `/api/v1/mt5/nodes/${id}/connect`,
      { method: 'POST' }
    ),

  disconnectNode: (id: number) =>
    fetchAPI<{ success: boolean; node_id: number; message: string; warning?: string }>(
      `/api/v1/mt5/nodes/${id}/disconnect`,
      { method: 'POST' }
    ),

  testNode: (id: number) =>
    fetchAPI<{ success: boolean; node_id: number; latency_ms: number; message: string }>(
      `/api/v1/mt5/nodes/${id}/test`,
      { method: 'POST' }
    ),

  testRaw: (data: { server_address: string; manager_login: number; password: string }) =>
    fetchAPI<{ success: boolean; server_address: string; manager_login: number; latency_ms: number; message: string }>(
      '/api/v1/mt5/nodes/test',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // ── Node Data ──────────────────────────────────────────────
  getNodeGroups: (id: number) =>
    fetchAPI<{ node_id: number; groups: MT5GroupAPI[]; total: number; generated_at: string }>(
      `/api/v1/mt5/nodes/${id}/groups`
    ),

  // ── Book Management ────────────────────────────────────────
  getNodeBooks: (id: number) =>
    fetchAPI<{
      node_id: number;
      books: NodeBookAPI[];
      total_books: number;
      total_assignments: number;
      generated_at: string;
    }>(`/api/v1/mt5/nodes/${id}/books`),

  assignGroups: (
    nodeId: number,
    book: string,
    groups: string[],
    assignedBy: string = 'admin'
  ) =>
    fetchAPI<{
      success: boolean;
      node_id: number;
      book_name: string;
      inserted: number;
      updated: number;
      total: number;
      assignments: { assignment_id: number; group_name: string; status: string }[];
    }>(
      `/api/v1/mt5/nodes/${nodeId}/books/${book}/groups`,
      {
        method: 'POST',
        body: JSON.stringify({ groups, assigned_by: assignedBy }),
      }
    ),

  removeAssignment: (nodeId: number, assignmentId: number) =>
    fetchAPI<{ success: boolean; deleted_id: number; group_name: string; book_name: string; message: string }>(
      `/api/v1/mt5/nodes/${nodeId}/books/assignments/${assignmentId}`,
      { method: 'DELETE' }
    ),
};
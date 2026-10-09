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
    cache: 'no-store',
    ...options,
    credentials: 'include',   // send nexrisk_session cookie on every request
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

export interface MT5PositionWithNode extends MT5Position {
  nodeName: string;
}

export interface MT5Position {
  position_id: number;
  login: number;
  symbol: string;
  action: 'BUY' | 'SELL';
  volume_lots: number;
  price_open: number;
  price_current: number;
  price_sl: number;
  price_tp: number;
  profit: number;
  swap: number;
  commission: number;
  time_create: number;
  time_update: number;
  comment: string;
}

export interface BookPositionsResponse {
  node_id: number;
  book_name: string;
  groups_queried: string[];
  positions: MT5Position[];
  total: number;
  unique_logins: number;
  summary: {
    total_positions: number;
    unique_traders: number;
    total_profit: number;
    total_volume: number;
  };
  generated_at: string;
  message?: string;
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
  getNodeSymbols: (id: number) =>
    fetchAPI<{
      node_id: number;
      symbols: {
        symbol:           string;
        description:      string;
        path:             string;
        currency_base:    string;
        currency_profit:  string;
        digits:           number;
        contract_size:    number;
        volume_min:       number;
        volume_max:       number;
        margin_initial:   number;
        swap_long:        number;
        swap_short:       number;
        spread:           number;
        trade_mode:       number;
        calc_mode:        number;
      }[];
      total:        number;
      generated_at: string;
    }>(`/api/v1/mt5/nodes/${id}/symbols`),

  getNodeGroups: (id: number) =>
    fetchAPI<{ node_id: number; groups: MT5GroupAPI[]; total: number; generated_at: string }>(
      `/api/v1/mt5/nodes/${id}/groups`
    ),

  getNodePositions: (nodeId: number, params?: { login?: number; group?: string }) => {
    const sp = new URLSearchParams();
    if (params?.login !== undefined) sp.set('login', String(params.login));
    if (params?.group) sp.set('group', params.group);
    const q = sp.toString();
    return fetchAPI<{ node_id: number; positions: MT5Position[]; total: number; generated_at: string }>(
      `/api/v1/mt5/nodes/${nodeId}/positions${q ? `?${q}` : ''}`
    );
  },

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

  getBookPositions: (nodeId: number, book: 'A' | 'B' | 'C') =>
    fetchAPI<BookPositionsResponse>(
      `/api/v1/mt5/nodes/${nodeId}/books/${book}/positions`
    ),

  getMasterNode: async (): Promise<MT5NodeAPI | undefined> => {
    const { nodes } = await fetchAPI<{ nodes: MT5NodeAPI[]; total: number; connected_count: number; generated_at: string }>(
      '/api/v1/mt5/nodes'
    );
    return (
      nodes.find(n => n.is_master && n.connection_status === 'CONNECTED') ??
      nodes.find(n => n.is_master) ??
      nodes.find(n => n.connection_status === 'CONNECTED')
    );
  },

  // Fetches B-Book positions from ALL connected nodes in parallel and merges them.
  // Each position is tagged with its source node name via the nodeName field.
  // Returns { positions, nodes } so callers know which nodes contributed.
  getAllBBookPositions: async (): Promise<{
    positions: MT5PositionWithNode[];
    nodes: MT5NodeAPI[];
  }> => {
    const { nodes } = await fetchAPI<{ nodes: MT5NodeAPI[]; total: number; connected_count: number; generated_at: string }>(
      '/api/v1/mt5/nodes'
    );
    // Filter by is_enabled only — connection_status from backend is unreliable.
    // Promise.allSettled below will silently skip any node that truly can't be reached.
    const connected = nodes.filter(n => n.is_enabled);
    if (!connected.length) return { positions: [], nodes: [] };

    const results = await Promise.allSettled(
      connected.map(async n => {
        const res = await fetchAPI<{ positions: MT5Position[]; total: number; generated_at: string }>(
          `/api/v1/mt5/nodes/${n.id}/books/B/positions`
        );
        return { node: n, positions: (res.positions ?? []).map(p => ({ ...p, nodeName: n.node_name })) };
      })
    );

    const positions: MT5PositionWithNode[] = [];
    const respondingNodes: MT5NodeAPI[] = []; // ALL nodes that responded, even with 0 positions
    for (const r of results) {
      if (r.status === 'fulfilled') {
        positions.push(...r.value.positions);
        respondingNodes.push(r.value.node);
      }
    }
    return { positions, nodes: respondingNodes };
  },
};

// ============================================
// cTrader Node Admin API
// Same Node Registry as the MT5 nodes, separate route family
// (/api/v1/ctrader/nodes). No per-node data or book routes exist for cTrader.
// Live status is delivered over WebSocket (event not published yet) —
// getNodeStatus is the seed for a page's initial load and must not be polled.
// ============================================

export interface CTraderNodeAPI {
  id: number;
  node_name: string;
  node_type: string;
  platform: string;
  server_address: string;
  plant_id: string;
  environment: string;
  manager_login: number;
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

export interface CTraderNodeStatusAPI {
  node_id: number;
  node_name: string;
  node_type: string;
  platform: string;
  server_address: string;
  plant_id: string;
  environment: string;
  manager_login: number;
  is_master: boolean;
  is_primary: boolean;
  is_enabled: boolean;
  connection_status: string;
  message: string;
  last_error_code: string;
  last_error: string;
  last_connected_at: string;
  server_version: string;
  permission_count: number;
  rtt_ms: number;
  connected_at_ms: number;
  last_inbound_at_ms: number;
  next_retry_at_ms: number;
  server_time_offset_ms: number;
  connect_attempts: number;
  sessions: number;
  frames_in: number;
  frames_out: number;
}

export interface CTraderConnectResult {
  success: boolean;
  pending: boolean;
  will_retry: boolean;
  node_id: number;
  connection_status: string;
  message: string;
  last_error_code: string;
  last_error: string;
  server_version: string;
  next_retry_at_ms: number;
}

export interface CTraderTestResult {
  success: boolean;
  state: string;
  message: string;
  error_code: string;
  server_version: string;
  permission_count: number;
  rtt_ms: number;
  latency_ms: number;
  used_live_connection: boolean;
  node_id?: number;
  server_address: string;
  plant_id: string;
  environment: string;
  manager_login: number;
}

export interface CTraderNodeCreate {
  node_name: string;
  node_type: string;
  server_address: string;
  plant_id: string;
  environment: string;
  manager_login: number;
  password: string;
  reconnect_interval_sec?: number;
  heartbeat_interval_sec?: number;
  is_enabled?: boolean;
  auto_connect?: boolean;
  // created_by is not sent from the browser: the server stamps it from the session.
}

export type CTraderNodeUpdate = Partial<{
  node_name: string;
  node_type: string;
  server_address: string;
  plant_id: string;
  environment: string;
  manager_login: number;
  password: string;
  reconnect_interval_sec: number;
  heartbeat_interval_sec: number;
  is_enabled: boolean;
}>;

export const ctraderApi = {
  getNodes: () =>
    fetchAPI<{ nodes: CTraderNodeAPI[]; total: number; connected_count: number; generated_at: string }>(
      '/api/v1/ctrader/nodes'
    ),

  // Initial-load seed only. Do not put this on a timer.
  getNodeStatus: () =>
    fetchAPI<{
      nodes: CTraderNodeStatusAPI[];
      total: number;
      connected_count: number;
      primary_node_id: number;
      primary_connected: boolean;
      generated_at: string;
    }>('/api/v1/ctrader/nodes/status'),

  getNode: (id: number) =>
    fetchAPI<CTraderNodeAPI>(`/api/v1/ctrader/nodes/${id}`),

  createNode: (data: CTraderNodeCreate) =>
    fetchAPI<{ success: boolean; message: string; node: CTraderNodeAPI }>(
      '/api/v1/ctrader/nodes',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // Send only the fields that change: a change to a connection setting
  // restarts the node. {"node_type":"MASTER"} on a STANDBY is the promotion.
  updateNode: (id: number, data: CTraderNodeUpdate) =>
    fetchAPI<{
      success: boolean;
      message: string;
      node: CTraderNodeAPI;
      demoted_node_id?: number;
      demoted_node_name?: string;
    }>(
      `/api/v1/ctrader/nodes/${id}`,
      { method: 'PUT', body: JSON.stringify(data) }
    ),

  deleteNode: (id: number) =>
    fetchAPI<{ success: boolean; message: string; deleted_id: number; deleted_name: string }>(
      `/api/v1/ctrader/nodes/${id}`,
      { method: 'DELETE' }
    ),

  // Waits up to ~13 s. 200 connected, 202 still connecting and 502 first
  // attempt failed all carry the same result object, so the 502 is an answer
  // here, not a thrown error. Anything else (404, 409, 429, ...) throws with
  // the operator-readable text.
  connectNode: async (id: number): Promise<CTraderConnectResult> => {
    const response = await fetch(`${API_BASE}/api/v1/ctrader/nodes/${id}/connect`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
    });
    const body = await response.json().catch(() => null);
    if (body && typeof body.connection_status === 'string') return body as CTraderConnectResult;
    throw new Error(body?.error || `HTTP ${response.status}`);
  },

  disconnectNode: (id: number) =>
    fetchAPI<{
      success: boolean;
      was_running: boolean;
      node_id: number;
      connection_status: string;
      message: string;
      warning?: string;
    }>(
      `/api/v1/ctrader/nodes/${id}/disconnect`,
      { method: 'POST' }
    ),

  // Waits up to ~17 s. Always 200 when the node exists; success is in the body.
  testNode: (id: number) =>
    fetchAPI<CTraderTestResult>(
      `/api/v1/ctrader/nodes/${id}/test`,
      { method: 'POST' }
    ),

  // Waits up to ~17 s. Opens a second session for the manager — for a stored
  // node prefer testNode, which reuses the live connection.
  testRaw: (data: {
    server_address: string;
    plant_id: string;
    environment: string;
    manager_login: number;
    password: string;
  }) =>
    fetchAPI<CTraderTestResult>(
      '/api/v1/ctrader/nodes/test',
      { method: 'POST', body: JSON.stringify(data) }
    ),
};

// ============================================
// Symbol Mapping API
// ============================================
export interface SymbolMappingRecord {
  id: number;
  mt5_symbol: string;
  lp_id: string;
  lp_name: string;
  lp_symbol: string;
  volume_multiplier: number;
  lp_price_precision: number;
  enabled: boolean;
  source: 'manual' | 'auto' | 'imported';
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutoMapSuggestionAPI {
  mt5_symbol: string;
  lp_id: string;
  lp_name: string;
  lp_symbol: string;
  confidence: number;
  volume_multiplier: number;
  lp_price_precision: number;
}

export const symbolMappingApi = {
  // ── CRUD ────────────────────────────────────────────────────

  getAll: (params?: { lp_id?: string; enabled?: boolean; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.lp_id)              sp.set('lp_id',   params.lp_id);
    if (params?.enabled !== undefined) sp.set('enabled', String(params.enabled));
    if (params?.limit)              sp.set('limit',   String(params.limit));
    if (params?.offset)             sp.set('offset',  String(params.offset));
    const q = sp.toString();
    return fetchAPI<{ mappings: SymbolMappingRecord[]; total: number; generated_at: string }>(
      `/api/v1/symbol-mappings${q ? `?${q}` : ''}`
    );
  },

  getById: (id: number) =>
    fetchAPI<SymbolMappingRecord>(`/api/v1/symbol-mappings/${id}`),

  create: (data: {
    mt5_symbol: string;
    lp_id: string;
    lp_symbol: string;
    volume_multiplier?: number;
    lp_price_precision?: number;
    enabled?: boolean;
  }) =>
    fetchAPI<SymbolMappingRecord>('/api/v1/symbol-mappings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: {
    lp_symbol?: string;
    volume_multiplier?: number;
    lp_price_precision?: number;
    enabled?: boolean;
    approved?: boolean;
  }) =>
    fetchAPI<SymbolMappingRecord>(`/api/v1/symbol-mappings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchAPI<{ success: boolean; deleted_id: number }>(`/api/v1/symbol-mappings/${id}`, {
      method: 'DELETE',
    }),

  // ── Bulk ─────────────────────────────────────────────────────

  import: (lp_id: string, rows: { mt5_symbol: string; lp_symbol: string; volume_multiplier?: number; lp_price_precision?: number }[]) =>
    fetchAPI<{ inserted: number; skipped: number; conflicts: string[] }>('/api/v1/symbol-mappings/import', {
      method: 'POST',
      body: JSON.stringify({ lp_id, rows }),
    }),

  autoMap: (params?: { lp_id?: string; dry_run?: boolean; min_confidence?: number }) =>
    fetchAPI<{ suggestions: AutoMapSuggestionAPI[]; dry_run: boolean; inserted?: number }>('/api/v1/symbol-mappings/auto-map', {
      method: 'POST',
      body: JSON.stringify(params ?? { dry_run: true }),
    }),

  approve: (id: number) =>
    fetchAPI<SymbolMappingRecord>(`/api/v1/symbol-mappings/${id}/approve`, {
      method: 'POST',
    }),

  approveAll: () =>
    fetchAPI<{ approved_count: number }>('/api/v1/symbol-mappings/approve-all', {
      method: 'POST',
    }),

  // ── Reference Data ────────────────────────────────────────────

  getMT5Symbols: () =>
    fetchAPI<{
      symbols: { symbol: string; description: string; digits: number; contract_size: number }[];
      total: number;
      source_nodes: number;
    }>('/api/v1/symbol-mappings/mt5-symbols'),

  getLPSymbols: (lp_id: string) =>
    fetchAPI<{ lp_id: string; symbols: string[]; total: number }>(
      `/api/v1/symbol-mappings/lp-symbols?lp_id=${encodeURIComponent(lp_id)}`
    ),

  getUnmapped: (lp_id?: string) => {
    const q = lp_id ? `?lp_id=${encodeURIComponent(lp_id)}` : '';
    return fetchAPI<{ unmapped: string[]; total: number }>(`/api/v1/symbol-mappings/unmapped${q}`);
  },
};

// ============================================
// WebSocket — real-time feeds
// ============================================

const WS_BASE = (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:8081';

export type WsEnvelope<T = unknown> = {
  topic:        string;
  type:         string;
  data:         T;
  timestamp_ms: number;
};

export type BBookWsEvent =
  | { type: 'SNAPSHOT';        data: MT5PositionWithNode[]         }
  | { type: 'POSITION_ADD';    data: MT5PositionWithNode            }
  | { type: 'POSITION_CHANGE'; data: MT5PositionWithNode            }
  | { type: 'POSITION_DELETE'; data: { position_id: number }        }
  | { type: 'subscribed';      data: { topics: string[] }           }
  | { type: 'pong';            data: { timestamp_ms: number }       };

/**
 * Opens a managed WebSocket to the B-Book real-time feed.
 * Returns a cleanup function — call it from useEffect cleanup to close gracefully.
 */
export function connectBBookWebSocket(
  onMessage: (event: BBookWsEvent) => void,
  onStatus?: (status: 'open' | 'closed' | 'error') => void
): () => void {
  const ws = new WebSocket(`${WS_BASE}/ws/v1/mt5/events`);

  ws.onopen = () => {
    onStatus?.('open');
    ws.send(JSON.stringify({ type: 'subscribe', topics: ['mt5.position'] }));
  };

  ws.onmessage = (ev: MessageEvent<string>) => {
    try {
      onMessage(JSON.parse(ev.data) as BBookWsEvent);
    } catch { /* ignore parse errors */ }
  };

  ws.onerror  = () => onStatus?.('error');
  ws.onclose  = () => onStatus?.('closed');

  return () => {
    ws.onclose = null;   // prevent status callback firing on intentional close
    ws.close(1000, 'Client disconnecting');
  };
}

// ============================================================================
// SNIPPET — add to src/services/api.ts
//
// Place near connectBBookWebSocket (around line 894). This snippet defines the
// types and the connect function for the portfolio.summary WebSocket topic.
// Does NOT replace anything — it's purely additive.
// ============================================================================

/** A single per-book block from the portfolio.summary.{period} payload. */
export interface PortfolioWsBookFields {
  positions:    number;
  realized:     number;
  unrealized:   number;
  /** Gross traded volume over the period (open legs + close legs), in lots. */
  volume:       number;
  /** Gross traded volume in MT5 contract-size units (lots × contract size). */
  volume_notional: number;
  /** Broker-direction long volume, in lots. For B-Book this is the SUM of
   *  client SELL position volumes (broker takes opposite side). For A and C
   *  this is the broker's own long-side volume from risk.hedge_records. */
  long_volume:  number;
  /** Broker-direction short volume, in lots. Mirror of long_volume. */
  short_volume: number;
  /** Per-book: long_volume - short_volume.
   *  For Portfolio (total): straight sum of A+B+C broker-direction volumes,
   *  representing firm directional lean. POSITIVE = net long lean.
   *  Hedge coverage uses a separate field (hedge_direction) on the total. */
  net_volume:   number;
  /** Notional equivalents of long_volume / short_volume / net_volume.
   *  Used when the consumer toggles to "Notional" units mode. */
  long_volume_notional:  number;
  short_volume_notional: number;
  net_volume_notional:   number;
  commissions:  number;
  swaps:        number;
  rebates:      number;
}

/** Total block on the portfolio.summary payload. Same shape as per-book plus
 *  hedge-coverage metrics that only make sense at portfolio level. */
export interface PortfolioWsTotalFields extends PortfolioWsBookFields {
  /** Hedge Direction = (A.net + C.net) − B.net, in lots.
   *  POSITIVE = OVER-hedged (hedges exceed B-Book exposure).
   *  NEGATIVE = under-hedged (B-Book exposure exceeds hedges).
   *  ZERO     = fully hedged.
   *  Distinct from net_volume which is straight-sum directional lean. */
  hedge_direction:          number;
  /** Notional equivalent of hedge_direction (lots × contract size summed). */
  hedge_direction_notional: number;
}

/** Prior-period comparison block. Present on the period=month payload only.
 *  `total` is prior-month NET REALIZED measured to the same day-of-month as
 *  the current MTD window (e.g. this month 1→14 vs last month 1→14), so the
 *  two are pace-comparable. `from`/`to` describe that prior window. */
export interface PortfolioVsPriorMonth {
  available: boolean;
  from:      string;            // YYYY-MM-DD — start of prior window
  to:        string;            // YYYY-MM-DD — same day-of-month, prior month
  total:     number | null;     // legacy — realized + delta_unrealized over window
  net_pnl:   number | null;     // realized + unrealized EOD at window end (MTM basis)
}

/** Push payload for topic "portfolio.summary.{period}". */
export interface PortfolioSummaryData {
  period:   string;             // "today" | "month"
  from:     string;             // ISO 8601
  to:       string;             // ISO 8601
  baseline: string;             // YYYY-MM-DD
  books: {
    B: PortfolioWsBookFields;
    A: PortfolioWsBookFields;
    C: PortfolioWsBookFields;
  };
  total: PortfolioWsTotalFields;
  /** Prior-month pace comparison — present on period=month only. */
  vs_prior_month?: PortfolioVsPriorMonth;
}

export type PortfolioWsEvent =
  | { type: 'SNAPSHOT';   data: PortfolioSummaryData }
  | { type: 'subscribed'; data: { topics: string[] } }
  | { type: 'pong';       data: { timestamp_ms: number } };

/** Period the frontend can ask for. */
export type PortfolioWsPeriod = 'today' | 'month';

/**
 * REST mirror of the portfolio.summary.{period} WebSocket topic. Returns a
 * payload byte-identical to a WS SNAPSHOT for the same period (books A/B/C +
 * total + from/to/baseline). Used to SEED the breakdown grid on mount so the
 * page is populated immediately — including weekends/holidays when the live
 * WS feed is silent (no market activity → no push). The WS stays the source
 * of truth: a live SNAPSHOT overwrites this seed.
 *
 * Only 'today' | 'month' are supported here ('week' returns HTTP 400).
 */
export async function getPortfolioSummary(
  period: PortfolioWsPeriod,
): Promise<PortfolioSummaryData> {
  return fetchAPI<PortfolioSummaryData>(`/api/v1/portfolio/summary?period=${period}`);
}

/**
 * One-shot REST snapshot of the per-symbol exposure breakdown — the seed
 * source for Card 3 (Where Is My Risk) on mount and when the WS is quiet
 * (weekends/holidays). Same payload shape as the portfolio.exposure.symbols
 * WS SNAPSHOT, so one parser handles both. Current open-position state — not
 * period-based. Returned unwrapped (no { success, data } envelope).
 */
export async function getPortfolioExposureSymbols(): Promise<PortfolioExposureSymbolsData> {
  return fetchAPI<PortfolioExposureSymbolsData>('/api/v1/portfolio/exposure/symbols');
}

/**
 * Open a managed WebSocket to the Portfolio Summary feed for a given period.
 * Switching periods closes and re-opens this connection (caller responsibility).
 */
export function connectPortfolioWebSocket(
  period: PortfolioWsPeriod,
  onMessage: (event: PortfolioWsEvent) => void,
  onStatus?: (status: 'open' | 'closed' | 'error') => void
): () => void {
  const ws    = new WebSocket(`${WS_BASE}/ws/v1/mt5/events`);
  const topic = `portfolio.summary.${period}`;

  ws.onopen = () => {
    onStatus?.('open');
    ws.send(JSON.stringify({ type: 'subscribe', topics: [topic] }));
  };

  ws.onmessage = (ev: MessageEvent<string>) => {
    try {
      const envelope = JSON.parse(ev.data);
      if (envelope.topic && envelope.topic !== topic) return;
      onMessage({ type: envelope.type, data: envelope.data } as PortfolioWsEvent);
    } catch { /* ignore parse errors */ }
  };

  ws.onerror = () => onStatus?.('error');
  ws.onclose = () => onStatus?.('closed');

  return () => {
    ws.onclose = null;
    ws.close(1000, 'Client disconnecting');
  };
}

// ============================================================================
// SNIPPET — portfolio.exposure.symbols WebSocket topic (Chart 7)
//
// Per-symbol exposure breakdown, broadcast at the same 1 Hz cadence as the
// portfolio.summary.{period} topics. Replaces the legacy REST polling +
// snapshot-table read path that depended on the dead ExposureEngine writer.
// Strictly additive — does not affect existing connectPortfolioWebSocket
// or connectBBookWebSocket consumers.
// ============================================================================

/** Single row in the per-symbol exposure breakdown.
 *  Lot values are BROKER VIEW (client BUY → broker short, etc.). */
export interface PortfolioExposureSymbolRow {
  symbol:            string;
  /** Timestamp the broadcaster computed this row. Same as parent `as_of`. */
  snapshot_time:     string;
  /** Sum of broker-side long lots across A+B+C for this symbol. */
  long_lots:         number;
  /** Sum of broker-side short lots across A+B+C for this symbol. */
  short_lots:        number;
  /** long_lots − short_lots. Positive = broker net long this symbol. */
  net_exposure_lots: number;
  /** A-Book net (long − short) for this symbol, broker view. */
  a_book_lots:       number;
  /** B-Book net (long − short) for this symbol, broker view. */
  b_book_lots:       number;
  /** C-Book net (long − short) for this symbol, broker view.
   *  NEW: previously absent from the legacy REST shape. */
  c_book_lots:       number;
  // Per-symbol B-Book P&L (Card 3 Row 1). Broker view: a symbol that cost the
  // broker money is negative. Optional — a symbol whose USD-conversion path is
  // unavailable may ship 0.0 or omit these.
  realized_pnl_mtd?:    number;
  unrealized_pnl?:      number;
  pnl_total_mtd?:       number;
  // Per-symbol B-Book USD notional (Card 3 Rows 2 & 3).
  b_book_notional_usd?: number;
}

/** Push payload for topic "portfolio.exposure.symbols". */
export interface PortfolioExposureSymbolsData {
  /** ISO 8601 UTC. Moment the broadcaster built this snapshot. */
  as_of:     string;
  totals: {
    a_book_net_lots: number;
    b_book_net_lots: number;
    c_book_net_lots: number;
  };
  /** Sorted by |net_exposure_lots| descending. Symbols with zero exposure
   *  across all books are omitted by the broadcaster. */
  by_symbol: PortfolioExposureSymbolRow[];
}

export type PortfolioExposureWsEvent =
  | { type: 'SNAPSHOT';   data: PortfolioExposureSymbolsData }
  | { type: 'subscribed'; data: { topics: string[] } }
  | { type: 'pong';       data: { timestamp_ms: number } };

/**
 * Open a managed WebSocket to the per-symbol exposure feed (Chart 7).
 * No period parameter — this is a snapshot of CURRENT open positions,
 * refreshed on every Recompute pass (≈1 Hz under tick storms, debounced).
 */
export function connectPortfolioExposureWebSocket(
  onMessage: (event: PortfolioExposureWsEvent) => void,
  onStatus?: (status: 'open' | 'closed' | 'error') => void
): () => void {
  const ws    = new WebSocket(`${WS_BASE}/ws/v1/mt5/events`);
  const topic = 'portfolio.exposure.symbols';

  ws.onopen = () => {
    onStatus?.('open');
    ws.send(JSON.stringify({ type: 'subscribe', topics: [topic] }));
  };

  ws.onmessage = (ev: MessageEvent<string>) => {
    try {
      const envelope = JSON.parse(ev.data);
      if (envelope.topic && envelope.topic !== topic) return;
      onMessage({ type: envelope.type, data: envelope.data } as PortfolioExposureWsEvent);
    } catch { /* ignore parse errors */ }
  };

  ws.onerror = () => onStatus?.('error');
  ws.onclose = () => onStatus?.('closed');

  return () => {
    ws.onclose = null;
    ws.close(1000, 'Client disconnecting');
  };
}
// ============================================================================
// Cockpit page — multi-topic WebSocket subscriber
//
// The Cockpit page needs BOTH portfolio.summary.today AND portfolio.summary.month
// simultaneously (Card 1 "Money" shows today and MTD side by side, not a
// period toggle). connectPortfolioWebSocket is single-topic; this connector
// opens one socket and subscribes to all cockpit topics together.
//
// As more cockpit cards come online (Card 5 coverage, Card 6 markup, NexDay
// cards 7-9), their topics are added to the COCKPIT_TOPICS array below. The
// consumer routes by envelope.topic.
//
// Strictly additive — does not affect any existing connect* function.
// ============================================================================

/** Envelope for any cockpit-subscribed message.
 *  `data` shape depends on `topic` — typed at the consumer (CockpitPage). */
export interface CockpitWsEvent {
  topic:         string;     // 'portfolio.summary.today' | 'portfolio.summary.month' | ...
  type:          'SNAPSHOT' | 'subscribed' | 'pong';
  data:          unknown;
  timestamp_ms?: number;
}

/**
 * Open a managed WebSocket for the Cockpit page.
 * Subscribes to all cockpit topics on a single connection. The consumer
 * routes by `envelope.topic`. Subscribe ACK and pong frames carry no
 * `topic` field and are filtered out before reaching the consumer.
 */
export function connectCockpitWebSocket(
  onMessage: (event: CockpitWsEvent) => void,
  onStatus?: (status: 'open' | 'closed' | 'error') => void
): () => void {
  const ws = new WebSocket(`${WS_BASE}/ws/v1/mt5/events`);

  const COCKPIT_TOPICS = [
    'portfolio.summary.today',
    'portfolio.summary.month',
    'portfolio.exposure.symbols',
    // future cards subscribe additional topics here:
    //   'cockpit.coverage',
    //   'cockpit.markup',
    //   'cockpit.trader_risk',
    //   'cockpit.symbol_risk',
    //   'cockpit.nexday_daily',
    //   'cockpit.nexday_intraday',
    //   'cockpit.nexday_opportunities',
  ];

  ws.onopen = () => {
    onStatus?.('open');
    ws.send(JSON.stringify({ type: 'subscribe', topics: COCKPIT_TOPICS }));
  };

  ws.onmessage = (ev: MessageEvent<string>) => {
    try {
      const envelope = JSON.parse(ev.data);
      // Forward only envelopes carrying a topic — subscribe ACK / pong
      // frames have no topic field and are silently ignored.
      if (envelope.topic) {
        onMessage(envelope as CockpitWsEvent);
      }
    } catch { /* ignore parse errors */ }
  };

  ws.onerror = () => onStatus?.('error');
  ws.onclose = () => onStatus?.('closed');

  return () => {
    ws.onclose = null;
    ws.close(1000, 'Client disconnecting');
  };
}

// ============================================================================
// Cockpit Card 4 — Trader Risk (REST, polled)
//
// Backed by GET /api/v1/cockpit/trader-risk. Update cadence is minutes-to-
// hours (classifier and clustering runs), so REST polling at ~60 s suits
// this better than a WS topic.
// ============================================================================

export interface CockpitTraderRisk {
  asOf: string;
  criticalTraders: {
    count:  number;
    logins: number[];
  };
  behavioral: {
    criticalCount: number;
    highCount:     number;
  };
  clusters: Array<{
    displayName: string;
  }>;
}

// ─── Cards 7/8/9 — NexDay predictions ────────────────────────────────────────

export interface CockpitPredictionsDailyTopLosing {
  mt5Symbol:         string;
  nexdaySymbol:      string;
  description:       string;
  predictedTrend:    string;   // "Up" | "Down"
  predictedStrength: number;   // signed
  predictedClose:    number;
  typicalPrice:      number;
}

export interface CockpitPredictionsDevelopingOpp {
  mt5Symbol:         string;
  nexdaySymbol:      string;
  description:       string;
  predictedTrend:    string;
  momentum:          string;
  daysSinceReversal: number;
}

export interface CockpitPredictionsMomentumShift {
  mt5Symbol:      string;
  nexdaySymbol:   string;
  description:    string;
  momentum:       string;   // "Tilting Up" | "Tilting Down" | "Reversed"
  predictedTrend: string;
}

export interface CockpitPredictionsIntradaySymbol {
  nexdaySymbol: string;
  description:  string;
}

export interface CockpitPredictionsOpportunity {
  mt5Symbol:            string;
  nexdaySymbol:         string;
  description:          string;
  conviction:           string;   // "Prime:In-Play" | "Caution" | etc.
  opportunity:          string;   // "Strong" | "Sustained" | "Qualified" | "Monitor"
  opportunityDirection: string;   // "UP" | "DOWN"
  opportunityScore:     number;
}

export interface CockpitPredictions {
  asOf: string;
  dailyOutlook: {
    targetDate:              string;
    topLosing:               CockpitPredictionsDailyTopLosing | null;
    developingOpportunities: CockpitPredictionsDevelopingOpp[];
    momentumShifts:          CockpitPredictionsMomentumShift[];
  };
  intradaySignals: {
    upCoTrending:          CockpitPredictionsIntradaySymbol[];
    downCoTrending:        CockpitPredictionsIntradaySymbol[];
    upCount:               number;
    downCount:             number;
    latestPredictionTime:  string;   // ISO; "" if no data
  };
  bestOpportunities: {
    top:               CockpitPredictionsOpportunity | null;
    hottest:           CockpitPredictionsOpportunity[];   // tier ≤ 3
    strongTier:        CockpitPredictionsOpportunity[];   // tier 4 or 5
    primeInPlayCount:  number;
  };
}

export const cockpitApi = {
  getTraderRisk: () =>
    fetchAPI<CockpitTraderRisk>('/api/v1/cockpit/trader-risk'),
  getPredictions: () =>
    fetchAPI<CockpitPredictions>('/api/v1/cockpit/predictions'),
  // Card 3 Row 3 — worst 1-day range % per MT5 symbol as a flat map
  // (mt5_symbol -> worst_range_fraction; fraction, NOT percent). Historical
  // stress input: worst of the last 100 daily bars, changes ≤ once/day.
  // Returned unwrapped (no { success, data } envelope). Fetched on-mount +
  // hourly by useCockpitLargest1Day — never fast-polled.
  getLargest1Day: () =>
    fetchAPI<Record<string, number>>('/api/v1/risk/largest-1day'),
};

/** REST endpoint that mirrors WebSocketManager::GetStatsJSON() */
export const wsApi = {
  getStats: () =>
    fetchAPI<{
      connected_clients:            number;
      total_msgs_sent:              number;
      total_connections_accepted:   number;
      total_connections_rejected:   number;
      zmq_events_received:          number;
      port:                         number;
      io_threads:                   number;
      max_connections:              number;
      clients: {
        remote_addr:   string;
        msgs_sent:     number;
        bytes_sent:    number;
        subscriptions: string[];
        connected_sec: number;
      }[];
    }>('/api/v1/ws/stats'),
};

// ============================================
// Auth API
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  role_label: string;
  can_trade: boolean;
}

export interface NexRiskRole {
  id: number;
  name: string;
  label: string;
}

export interface NexRiskUser {
  id: string;
  email: string;
  role: string;
  role_label?: string;
  is_active: boolean;
  created_at?: string;
}

export const authApi = {
  /** Probe for an active session. Returns user + permissions, or null on 401. */
  me: async (): Promise<{ user: AuthUser; permissions: Record<string, string> } | null> => {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`/auth/me failed: ${res.status}`);
    return res.json();
  },
};

// ============================================
// Users & Roles API
// ============================================

export const usersApi = {
  /** Create a new user. BFF sends the invite email automatically. */
  create: (email: string, roleId: number) =>
    fetchAPI<{
      user: NexRiskUser;
      invite_expires_at: string;
      invite_sent: boolean;
      message: string;
    }>('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify({ email, role_id: roleId }),
    }),

  getAll: () =>
    fetchAPI<{ users: NexRiskUser[]; total: number }>('/api/v1/users'),

  getById: (id: string) =>
    fetchAPI<NexRiskUser>(`/api/v1/users/${id}`),

  update: (id: string, patch: { role_id?: number; is_active?: boolean }) =>
    fetchAPI<NexRiskUser>(`/api/v1/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deactivate: (id: string) =>
    fetchAPI<{ status: string }>(`/api/v1/users/${id}`, { method: 'DELETE' }),

  /** Reissue invite and resend email. Only valid for unenrolled users. */
  reissueInvite: (id: string) =>
    fetchAPI<{
      user: Pick<NexRiskUser, 'id' | 'email'>;
      invite_expires_at: string;
      invite_sent: boolean;
      message: string;
    }>(`/api/v1/users/${id}/invite`, { method: 'POST' }),

  getRoles: () =>
    fetchAPI<{ roles: NexRiskRole[] }>('/api/v1/roles'),

  getRolePermissions: (roleId: number) =>
    fetchAPI<{ role_id: number; permissions: Record<string, string> }>(
      `/api/v1/roles/${roleId}/permissions`
    ),
};
// ============================================
// Settings API — System Administration surface
// ============================================
//
// Shapes match settings_api.md exactly (snake_case). These hit the BFF's
// raw pass-through routes (e.g. /settings/gateway, /settings/pending-restart-raw,
// /settings/logs/services) — not the camelCase-transforming legacy routes.
//
// Scope of this module in v1: Gateway end-to-end, plus the cross-cutting
// pending-restart and log-services endpoints that the hub + sub-pages need.
// The other eight panels will extend this module in follow-up tickets.

// ── shared response shapes ─────────────────────────────────────

/** Emitted by standalone file-backed endpoints (LP, Gateway, FIX Bridge). */
export interface RestartRequiredEnvelope {
  success: boolean;
  restart_required?: string[];
  message?: string;
  error?: string;
  errors?: string[];
  warnings?: string[];
}

/** Emitted by SettingsManager-backed endpoints (nexrisk subsections,
 *  Telegram/webhook CRUD, classifier/detection/LLM). `pending_restart`
 *  is true when any restart-flagged field has changed since the last
 *  service restart — not just in the current request. */
export interface SettingsManagerEnvelope {
  success:          boolean;
  warnings?:        string[];
  pending_restart?: boolean;
  restart_notice?:  string;
  error?:           string;
  errors?:          string[];
}

/** GET /api/v1/settings/pending-restart */
export interface PendingRestartResponse {
  has_pending: boolean;
  pending_fields: { section: string; subsection?: string; field: string }[];
}

// ── Gateway ────────────────────────────────────────────────────

/** GET /api/v1/settings/gateway — gateway_password is always masked on read. */
export interface GatewayConfig {
  mt5_server:       string;
  gateway_login:    number;
  gateway_password: string;   // masked "***" on GET
  gateway_listen:   string;
  gateway_name:     string;
  timezone_minutes: number;
  log_path:         string;
}

export interface GatewayGetResponse {
  success: boolean;
  data:    GatewayConfig;
}

/** Body for PUT /api/v1/settings/gateway.
 *  gateway_password: null (or absent) means "leave unchanged" — never send
 *  the masked "***" value back. Pass every other field you want to update. */
export type GatewayUpdateBody = Partial<Omit<GatewayConfig, 'gateway_password'>> & {
  gateway_password?: string | null;
};

/** GET /api/v1/settings/gateway/status  (§ G3 — live). Derived from the
 *  gateway status log + SCM process state. Metrics are null unless
 *  state === 'live'. Trust mt5_connected only when state === 'live'. */
export type GatewayLiveState =
  | 'live' | 'warming_up' | 'no_recent_status' | 'stale' | 'down' | 'unknown';

export interface GatewayStatus {
  success:           boolean;
  service_state:     string;              // SCM state, e.g. RUNNING / STOPPED
  running:           boolean;             // primary up/down signal
  state:             GatewayLiveState;
  mt5_connected:     boolean | null;      // only trustworthy when state==='live'
  ticks_received:    number | null;
  ticks_sent:        number | null;
  tick_rate_per_sec: number | null;
  status_line_time:  string | null;       // raw ts of the last status line
  status_age_sec:    number | null;        // how old that line is
  source:            string;               // e.g. 'log'
  note:              string;
}

// ── FIX Bridge operational (§ 8) ──────────────────────────────

export type FixBridgeLogLevel   = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type FixBridgeCompression = 'none' | 'zstd' | 'gzip';
export type FixBridgeAutoExportTrigger =
  | 'SESSION_GAP' | 'BOOK_STALE_EXTENDED' | 'MASS_REJECT' | 'SEQ_RESET_FORCED';

export const FIX_BRIDGE_LOG_LEVELS:  FixBridgeLogLevel[]    = ['trace', 'debug', 'info', 'warn', 'error'];
export const FIX_BRIDGE_COMPRESSIONS: FixBridgeCompression[] = ['none', 'zstd', 'gzip'];
export const FIX_BRIDGE_AUTO_EXPORT_TRIGGERS: FixBridgeAutoExportTrigger[] =
  ['SESSION_GAP', 'BOOK_STALE_EXTENDED', 'MASS_REJECT', 'SEQ_RESET_FORCED'];

export interface FixBridgeAuditRawFix {
  enabled:         boolean;
  retention_hours: number;
  segment_size_mb: number;
  compression:     FixBridgeCompression;
}

export interface FixBridgeAuditNormalizedDom {
  enabled:               boolean;
  retention_hours:       number;
  snapshot_interval_sec: number;
  segment_size_mb:       number;
}

export interface FixBridgeAudit {
  raw_fix:        FixBridgeAuditRawFix;
  normalized_dom: FixBridgeAuditNormalizedDom;
}

export interface FixBridgeIncident {
  bundle_path:    string;
  max_bundles:    number;
  auto_export_on: FixBridgeAutoExportTrigger[];
}

export interface FixBridgeBackpressure {
  trading_outbound_max: number;
  md_inbound_max:       number;
  dom_publish_max:      number;
}

export interface FixBridgeConfig {
  log_level:    FixBridgeLogLevel;
  audit:        FixBridgeAudit;
  incident:     FixBridgeIncident;
  backpressure: FixBridgeBackpressure;
}

export interface FixBridgeGetResponse {
  success: boolean;
  data:    FixBridgeConfig;
}

/** Body for PUT /api/v1/settings/fixbridge. The backend scope-limits writes
 *  to log_level/audit/incident/backpressure — any other top-level key is
 *  ignored. Nested sub-objects are sent whole (no merge semantics). */
export type FixBridgeUpdateBody = Partial<FixBridgeConfig>;

/** GET /api/v1/settings/fixbridge/status  (§ G4 — live). Queries the bridge
 *  over its command channel + the core service client-side view. Degraded
 *  shapes: client uninitialised -> { connected:false, state:'unavailable',
 *  message }; command round-trip fails while SUB link up -> bridge:null +
 *  bridge_error. Use client.last_event_timestamp_us for "last message" —
 *  NOT last_heartbeat_us (currently always 0). */
export interface FixBridgeLp {
  lp_id:         string;
  provider_type: string;
  state:         string;                   // e.g. 'CONNECTED'
}

export interface FixBridgeClient {
  connected:               boolean;
  commands_sent:           number;
  commands_failed:         number;
  events_received:         number;
  executions_received:     number;
  md_updates_received:     number;
  last_event_timestamp_us: number;          // microseconds epoch
  last_heartbeat_us:       number;          // currently 0 — do NOT use
}

export interface FixBridgeBridge {
  bridge_id:          string;
  environment:        string;
  state:              string;
  uptime_sec:         number;
  commands_processed: number;
  commands_failed:    number;
  lps:                FixBridgeLp[];
}

export interface FixBridgeStatus {
  success:       boolean;
  connected:     boolean;                   // core<->bridge SUB link
  client?:       FixBridgeClient;
  bridge?:       FixBridgeBridge | null;    // null when the round-trip fails
  state?:        string;                    // 'unavailable' when uninitialised
  message?:      string;
  bridge_error?: string;
}

// ── Log services (used by Gateway Service panel) ───────────────

export interface LogServiceDescriptor {
  id:                 'nexrisk' | 'gateway' | 'fixbridge' | 'fix_messages';
  label:              string;
  log_dir:            string;
  level_configurable: boolean;
}

export interface LogServicesResponse {
  success:  boolean;
  services: LogServiceDescriptor[];
}

// ── Service health (§ G1) ──────────────────────────────────────
// GET /api/v1/settings/services/health — live process state for the three
// managed services. Snake_case, matches the FE action list 1:1.

export type ServiceState =
  | 'RUNNING' | 'STOPPED' | 'START_PENDING' | 'STOP_PENDING'
  | 'PAUSED'  | 'PAUSE_PENDING' | 'CONTINUE_PENDING' | 'UNKNOWN';

export interface ServiceHealth {
  id:             'nexrisk' | 'gateway' | 'fixbridge';
  label:          string;
  state:          ServiceState;
  running:        boolean;             // convenience: state === 'RUNNING'
  uptime_seconds: number | null;       // null when the service is down
  last_start:     string | null;       // ISO-8601 UTC; null when down
}

export interface ServicesHealthResponse {
  success:  boolean;
  services: ServiceHealth[];
}

// ── Settings audit history (§ G2) ──────────────────────────────
// GET /api/v1/settings/{section}/history?limit=&from=&to= — newest-first.
// Envelope is { history, total } (no success wrapper). changed_by is the
// real JWT email. old_values/new_values are per-field diffs.

/** Sections that expose an audit history. LP is intentionally excluded —
 *  LP profile/enabled writes aren't audited yet (backend "G2 LP tail"). */
export type SettingsHistorySection =
  | 'nexrisk' | 'classifier' | 'detection' | 'llm' | 'gateway' | 'fixbridge';

export interface SettingsHistoryEntry {
  id:          number;
  subsection:  string;
  change_type: string;                      // UPDATE | CREATE | DELETE
  old_values:  Record<string, unknown> | null;
  new_values:  Record<string, unknown> | null;
  changed_by:  string;                      // real user (JWT email)
  changed_at:  string;                      // ISO-8601 UTC
  reason:      string;
}

export interface SettingsHistoryResponse {
  history: SettingsHistoryEntry[];
  total:   number;
}

/** Query params for a history fetch. limit default 100, capped 1000 by the
 *  backend; from/to are an optional ISO-8601 range. */
export interface SettingsHistoryParams {
  limit?: number;
  from?:  string;
  to?:    string;
}

// ── Alerting (§§ 3.2 alerts, 4 telegram, 5 webhooks) ────────────

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const ALERT_SEVERITIES: AlertSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** § 3.2 alerts subsection — four scalars, no secrets. */
export interface AlertsConfig {
  enabled:                 boolean;
  min_severity:            AlertSeverity;
  cooldown_seconds:        number;
  max_per_trader_per_hour: number;
}

export type AlertsUpdateBody = Partial<AlertsConfig>;

/** § 4 Telegram chat row as stored and returned. `id` is the internal
 *  identifier (chat_<12hex>); `chat_id` is the Telegram-side numeric id. */
export interface TelegramChat {
  id:           string;
  chat_id:      string;
  label:        string;
  alert_levels: AlertSeverity[];
}

/** § 3.2 /nexrisk/telegram core config. Inner shape beyond the documented
 *  fields is uncertain — the spec describes the CRUD surface but not the
 *  full bulk-PUT body. Fields below are an educated inference: `bot_token`
 *  is masked "***" on GET per the usual secrets-on-read pattern, and the
 *  chats array is present but typically mutated via the CRUD endpoints. */
export interface TelegramConfig {
  enabled?:   boolean;
  bot_token?: string;          // masked "***" on GET
  chats?:     TelegramChat[];
  [key: string]: unknown;
}

/** Body for PUT /nexrisk/telegram. bot_token write-preserve: omit or
 *  send null to leave unchanged. chats can be omitted to have the backend
 *  leave the existing list alone — CRUD is the primary chat mutation path. */
export type TelegramUpdateBody = {
  enabled?:   boolean;
  bot_token?: string | null;
  chats?:     TelegramChat[];
};

export interface TelegramChatCreateBody {
  chat_id:      string;
  label:        string;
  alert_levels: AlertSeverity[];
}

export interface TelegramChatUpdateBody {
  chat_id?:      string;
  label?:        string;
  alert_levels?: AlertSeverity[];
}

export interface TelegramChatCreateResponse {
  success:         boolean;
  chat:            TelegramChat;
  pending_restart: boolean;
}

/** § 4 validate response — confirmed against a live payload. `valid` is the
 *  token-verdict flag (NOT `ok`); `success` reports whether the probe ran. */
export interface TelegramValidateResponse {
  success:       boolean;
  valid:         boolean;
  bot_id?:       number;
  bot_name?:     string;
  bot_username?: string;
}
export interface TelegramResolveResponse {
  chat_id: string;
  title:   string;
  type:    string;                // 'channel' | 'group' | 'supergroup' | 'private'
}
export interface TelegramTestResponse {
  ok:          boolean;
  message_id?: number;
}

/** § 5 Webhook endpoint row. */
export interface WebhookEndpoint {
  id:           string;
  url:          string;
  auth_header?: string;
  alert_levels: AlertSeverity[];
  enabled:      boolean;
}

/** § 3.2 /nexrisk/webhooks core config. Similar loose-shape inference as
 *  TelegramConfig — the documented fields are the CRUD surface plus an
 *  `enabled` toggle; other fields may exist but aren't spec'd. */
export interface WebhooksConfig {
  enabled?:   boolean;
  endpoints?: WebhookEndpoint[];
  [key: string]: unknown;
}

export type WebhooksUpdateBody = {
  enabled?:   boolean;
  endpoints?: WebhookEndpoint[];
};

export interface WebhookEndpointCreateBody {
  url:           string;
  auth_header?:  string;
  alert_levels:  AlertSeverity[];
  enabled:       boolean;
}

export type WebhookEndpointUpdateBody = Partial<WebhookEndpointCreateBody>;

export interface WebhookEndpointCreateResponse {
  success:         boolean;
  webhook:         WebhookEndpoint;
  pending_restart: boolean;
}

/** § 5 webhook test probe — confirmed against live payloads. HTTP is always
 *  200; the outcome is in `delivered` (NOT `ok`). `status` is the target's HTTP
 *  code (null when unreachable); `error` carries the reason on failure. */
export interface WebhookTestResponse {
  success:     boolean;
  delivered?:  boolean;
  status?:     number | null;
  latency_ms?: number;
  error?:      string;
}

// ── LP Management (§ 6) ─────────────────────────────────────────

/** Summary row returned by GET /lp/profiles. */
export interface LpProfileSummary {
  lp_id:   string;
  lp_name: string;
  version: string;
  enabled: boolean;    // mirror of enabled_lps membership, for convenience
}

/** Response shape for GET /lp/profiles. enabled_lps is the authoritative
 *  enablement list; each profile.enabled should match membership of
 *  enabled_lps but the UI treats enabled_lps as the source of truth. */
export interface LpProfilesResponse {
  success:     boolean;
  enabled_lps: string[];
  profiles:    LpProfileSummary[];
}

/** The capability JSON's top-level shape is loose. These are the documented
 *  keys per § 6; inner schemas vary per LP type and aren't fully specified.
 *  The frontend treats each top-level section as an opaque object and
 *  renders a raw-JSON editor against it. */
export interface LpProfile {
  lp_id?:         string;
  lp_name?:       string;
  version?:       string;
  enabled?:       boolean;

  /** Read-only sections — silently preserved by the backend on PUT. */
  connection?:    Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  instruments?:   Record<string, unknown>;

  /** Editable sections — replaced wholesale by what the client sends. */
  trading?:       Record<string, unknown>;
  market_data?:   Record<string, unknown>;
  routes?:        Record<string, unknown>;
  limits?:        Record<string, unknown>;
  features?:      Record<string, unknown>;

  /** Allow other keys to pass through unmodified. */
  [key: string]:  unknown;
}

/** The read-only / editable split. Derived from brief § 2.7 / spec § 6. */
export const LP_READONLY_SECTIONS = ['connection', 'custom_fields', 'instruments'] as const;
export const LP_EDITABLE_SECTIONS = ['trading', 'market_data', 'routes', 'limits', 'features'] as const;
export type LpReadonlySection = typeof LP_READONLY_SECTIONS[number];
export type LpEditableSection = typeof LP_EDITABLE_SECTIONS[number];

export interface LpEnabledUpdateBody {
  enabled_lps: string[];
}

// ── Secret rotation (§ 10) — root only ──────────────────────────

/** POST /settings/auth/rotate/internal-secret response. 96-hex `new_secret`,
 *  restarts both nexrisk_service AND the BFF (because the BFF's
 *  X-Internal-Secret must match the backend's env var). */
export interface RotateInternalResponse {
  success:          boolean;
  status:           'rotated';
  new_secret:       string;
  restart_required: string[];
  message:          string;
}

/** POST /settings/auth/rotate/jwt-secret response. 128-hex `new_secret`,
 *  restarts nexrisk_service only. `invalidates_sessions: true` means
 *  all access tokens die on restart; refresh tokens remain valid. */
export interface RotateJwtResponse {
  success:               boolean;
  status:                'rotated';
  new_secret:            string;
  invalidates_sessions:  boolean;
  restart_required:      string[];
  message:               string;
}

/** GET /settings/auth/rotate/encryption-key/preflight response. Read-only probe. */
export interface EncryptionKeyPreflight {
  success:                 boolean;
  lp_accounts:             number;
  users_with_totp:         number;
  estimated_duration_sec:  number;
  ok_to_proceed:           boolean;
  blockers:                string[];
}

/** POST /settings/auth/rotate/encryption-key response. Shape is a best-effort
 *  hypothesis — endpoint returns 501 today; fields below are derived
 *  from the internal/JWT response shape. */
export interface RotateEncryptionResponse {
  success:          boolean;
  status:           'rotated';
  new_secret:       string;
  restart_required: string[];
  message:          string;
}

// ── Log viewer types (§ 9) ──────────────────────────────────────

export type LogServiceId = LogServiceDescriptor['id'];
export type LogLevel     = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export const LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

export interface LogFileDescriptor {
  name:        string;
  size_bytes:  number;
  modified_at: string;     // ISO timestamp
}

export interface LogFilesResponse {
  success: boolean;
  files:   LogFileDescriptor[];
}

export interface LogLine {
  text: string;
}

export interface LogTailResponse {
  success:    boolean;
  file:       string;       // which file was tailed (newest)
  lines:      LogLine[];
  truncated:  boolean;      // true if there were more lines than `lines` requested
}

export interface LogSearchResponse {
  success:     boolean;
  file:        string;
  match_count: number;
  lines:       LogLine[];
  truncated:   boolean;
}

export interface LogLevelUpdateBody {
  level: LogLevel;
}

// ── low-level helper: let 501 flow through as a distinct result ───
//
// The generic fetchAPI throws on any non-2xx. The 501 stubs
// (/gateway/status, /fixbridge/status, telegram/webhook probes, encryption-key
// rotate) are a documented "not implemented yet" state — callers need to
// render "awaiting backend" UI, not a banner-worthy error. This helper
// returns a discriminated union so the caller handles it explicitly.

export type ApiResult<T> =
  | { kind: 'ok';            data: T }
  | { kind: 'not_implemented' }
  | { kind: 'error';         status: number; message: string };

async function fetchWithStub<T>(endpoint: string, init?: RequestInit): Promise<ApiResult<T>> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    cache: 'no-store',
    credentials: 'include',
    ...init,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 501) return { kind: 'not_implemented' };
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { kind: 'error', status: res.status, message: body.error ?? body.message ?? `HTTP ${res.status}` };
  }
  return { kind: 'ok', data: await res.json() as T };
}

// ── query-string builder for the settings history endpoints (§ G2) ──
function historyQuery(params?: SettingsHistoryParams): string {
  if (!params) return '';
  const q = new URLSearchParams();
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  if (params.from) q.set('from', params.from);
  if (params.to)   q.set('to',   params.to);
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

// ── Nexrisk config (§ 3) — powers NexDay / TE / Auth tiles ────
//
// All three subsections live inside config/nexrisk_config.json. One GET
// fan-out fills three hub tiles. Secrets (license_id, api_key, bot_token)
// are masked on read; write-preserve discipline is enforced at the sub-page
// level when the respective PUT endpoints are added.

export interface NexdayPolling {
  intraday_enabled:          boolean;
  intraday_interval_minutes: number;
  daily_enabled:             boolean;
  daily_time_et:             string;   // "HH:MM"
}

export interface NexdayRetention {
  daily_bars:    number;
  intraday_bars: number;
}

export interface NexdayHedging {
  auto_suggest:              boolean;
  min_position_volume:       number;
  suggestion_expiry_minutes: number;
}

export interface NexdayConfig {
  enabled:     boolean;
  api_server:  string;
  license_id:  string;        // masked on GET
  polling:     NexdayPolling;
  retention:   NexdayRetention;
  hedging:     NexdayHedging;
}

/** Body for PUT /api/v1/settings/nexrisk/nexday.
 *  license_id: null (or absent) means "leave unchanged" — never send the
 *  masked value back. Nested sub-objects (polling, retention, hedging) are
 *  sent as complete objects since the backend replaces the subsection. */
export type NexdayUpdateBody =
  Partial<Omit<NexdayConfig, 'license_id'>> & {
    license_id?: string | null;
  };

export interface TradingEconomicsConfig {
  enabled:               boolean;
  api_key:               string;   // masked on GET
  preload_days_back:     number;
  preload_days_ahead:    number;
  poll_interval_seconds: number;
  ws_endpoint:           string;
}

/** Body for PUT /api/v1/settings/nexrisk/trading-economics.
 *  api_key: null (or absent) means "leave unchanged" — never send the
 *  masked "***" value back. Pass every other field you want to update. */
export type TradingEconomicsUpdateBody =
  Partial<Omit<TradingEconomicsConfig, 'api_key'>> & {
    api_key?: string | null;
  };

export interface AuthConfig {
  totp_issuer:                string;
  access_token_ttl_seconds:   number;
  refresh_token_ttl_seconds:  number;
  invite_token_ttl_seconds:   number;
  password_min_length:        number;
  password_reset_ttl_seconds: number;
}

/** GET /api/v1/settings/nexrisk-raw may return either { nexrisk: {...} } or a
 *  flat object — settingsApi.nexrisk.get() unwraps defensively so callers
 *  always see the flat shape below. Fields are optional because the backend
 *  can evolve subsections independently of this type. */
export interface NexriskConfig {
  nexday?:             NexdayConfig;
  trading_economics?:  TradingEconomicsConfig;
  auth?:               AuthConfig;
  alerts?:             AlertsConfig;
  telegram?:           TelegramConfig;
  webhooks?:           WebhooksConfig;
  // Other subsections (mt5, analysis, detection-system, memory, llm-system)
  // exist on the backend but aren't typed here until their sub-pages land.
  [key: string]: unknown;
}

// ── bot_token write-preserve guard ──────────────────────────────
// A Telegram bot token is always "<digits>:<auth>" — it contains a colon and
// real characters. A masked read-back ("***", "••••…") or a blank/whitespace
// field has no colon and/or is nothing but mask glyphs. Treat those as "no
// token supplied": on validate we omit it so the backend checks the stored
// token; on save we drop the field so the stored secret is never overwritten.
// Centralised here so the guard holds regardless of which caller sends it.
function isBotTokenShaped(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (t === '') return false;
  if (/^[*•·●\s]+$/.test(t)) return false;   // all mask glyphs / whitespace
  return t.includes(':');                     // real tokens always contain ':'
}

// ── settingsApi surface ─────────────────────────────────────────

export const settingsApi = {
  /** Page-level pending-restart query, raw snake_case shape. */
  getPendingRestart: () =>
    fetchAPI<PendingRestartResponse>('/api/v1/settings/pending-restart-raw'),

  services: {
    /** GET /services/health (§ G1) — live status / uptime / last_start for
     *  the three managed services (nexrisk / gateway / fixbridge). Match a
     *  page's Service panel by entry.id. Poll ~10-30s. */
    health: () =>
      fetchAPI<ServicesHealthResponse>('/api/v1/settings/services/health'),
  },

  gateway: {
    get: () =>
      fetchAPI<GatewayGetResponse>('/api/v1/settings/gateway'),

    /** Caller MUST omit gateway_password (or send null) to keep existing.
     *  Never send the masked "***" value back — it would be written as-is. */
    update: (patch: GatewayUpdateBody) =>
      fetchAPI<RestartRequiredEnvelope>('/api/v1/settings/gateway', {
        method: 'PUT',
        body:   JSON.stringify(patch),
      }),

    /** GET /gateway/status (§ G3 — live). Resolves to kind:'ok' with the
     *  live payload; the not_implemented branch is retained for safety but
     *  the endpoint no longer 501s. */
    status: () =>
      fetchWithStub<GatewayStatus>('/api/v1/settings/gateway/status'),

    /** GET /gateway/history (§ G2) — settings audit trail, newest-first.
     *  limit default 100 (capped 1000); optional ISO from/to range. */
    history: (params?: SettingsHistoryParams) =>
      fetchAPI<SettingsHistoryResponse>(
        `/api/v1/settings/gateway/history${historyQuery(params)}`),
  },

  fixbridge: {
    get: () =>
      fetchAPI<FixBridgeGetResponse>('/api/v1/settings/fixbridge'),

    /** Backend scope-limits writes to log_level / audit / incident /
     *  backpressure — other file keys are preserved. Nested sub-objects
     *  are sent whole (no merge semantics). */
    update: (patch: FixBridgeUpdateBody) =>
      fetchAPI<RestartRequiredEnvelope>('/api/v1/settings/fixbridge', {
        method: 'PUT',
        body:   JSON.stringify(patch),
      }),

    /** GET /fixbridge/status (§ G4 — live). Same discriminated-union pattern
     *  as gateway.status; the not_implemented branch is retained for safety
     *  but the endpoint no longer 501s. */
    status: () =>
      fetchWithStub<FixBridgeStatus>('/api/v1/settings/fixbridge/status'),

    /** GET /fixbridge/history (§ G2) — settings audit trail, newest-first. */
    history: (params?: SettingsHistoryParams) =>
      fetchAPI<SettingsHistoryResponse>(
        `/api/v1/settings/fixbridge/history${historyQuery(params)}`),
  },

  lp: {
    /** GET /lp/profiles — list of profile summaries + authoritative enabled list. */
    listProfiles: () =>
      fetchAPI<LpProfilesResponse>('/api/v1/settings/lp/profiles'),

    /** GET /lp/profiles/:lp_id — full capability JSON. The response may
     *  be either a flat object or wrapped under `data`; caller unwraps. */
    getProfile: async (lp_id: string): Promise<LpProfile> => {
      const raw = await fetchAPI<Record<string, unknown>>(
        `/api/v1/settings/lp/profiles/${encodeURIComponent(lp_id)}`,
      );
      const wrapped = raw.data;
      const inner   = wrapped && typeof wrapped === 'object' ? wrapped : raw;
      return inner as LpProfile;
    },

    /** PUT /lp/profiles/:lp_id — writes the profile. The backend silently
     *  preserves connection / custom_fields / instruments regardless of
     *  what the client sends for them, so it's safe (and explicit) to
     *  send the full object back. restart:fixbridge. */
    updateProfile: (lp_id: string, profile: LpProfile) =>
      fetchAPI<RestartRequiredEnvelope>(
        `/api/v1/settings/lp/profiles/${encodeURIComponent(lp_id)}`,
        {
          method: 'PUT',
          body:   JSON.stringify(profile),
        },
      ),

    /** PUT /lp/enabled — replaces the enabled_lps array in
     *  fixbridge_config.json. restart:fixbridge. */
    updateEnabled: (body: LpEnabledUpdateBody) =>
      fetchAPI<RestartRequiredEnvelope>('/api/v1/settings/lp/enabled', {
        method: 'PUT',
        body:   JSON.stringify(body),
      }),
  },

  logs: {
    /** Used by the Gateway Service panel to surface the gateway log_dir. */
    getServices: () =>
      fetchAPI<LogServicesResponse>('/api/v1/settings/logs/services'),

    /** GET /logs/:service/files — list files for a service, newest first
     *  (sort order is the backend's responsibility). */
    getFiles: (service: LogServiceId) =>
      fetchAPI<LogFilesResponse>(`/api/v1/settings/logs/${encodeURIComponent(service)}/files`),

    /** GET /logs/:service/tail?lines=N — tail the newest file for the service.
     *  lines is capped at 5000 by the backend. */
    getTail: (service: LogServiceId, lines: number) => {
      const params = new URLSearchParams({ lines: String(lines) });
      return fetchAPI<LogTailResponse>(`/api/v1/settings/logs/${encodeURIComponent(service)}/tail?${params}`);
    },

    /** GET /logs/:service/search?file=X&q=Y&limit=N — substring search
     *  within a single file. file must be in the service's log_dir. */
    search: (service: LogServiceId, file: string, q: string, limit: number) => {
      const params = new URLSearchParams({ file, q, limit: String(limit) });
      return fetchAPI<LogSearchResponse>(`/api/v1/settings/logs/${encodeURIComponent(service)}/search?${params}`);
    },

    /** Builds the URL for a direct <a href> download. The browser sends
     *  cookies (session auth) and follows the BFF stream; backend sets
     *  Content-Disposition. Don't fetch+blob unless you have a reason. */
    downloadUrl: (service: LogServiceId, file: string) => {
      const params = new URLSearchParams({ file });
      return `/api/v1/settings/logs/${encodeURIComponent(service)}/download?${params}`;
    },

    /** PUT /logs/:service/level — set the runtime log level. Returns
     *  { restart_required: [service], message }. Not valid for fix_messages
     *  (level_configurable: false). Caller should gate UI on hasPermission
     *  ('settings', 'EDIT'). */
    setLevel: (service: LogServiceId, level: LogLevel) =>
      fetchAPI<RestartRequiredEnvelope>(`/api/v1/settings/logs/${encodeURIComponent(service)}/level`, {
        method: 'PUT',
        body:   JSON.stringify({ level }),
      }),
  },

  nexrisk: {
    /** Fetches the full nexrisk config; unwraps { nexrisk: ... } if present.
     *  Used by the hub to fill NexDay / Trading Economics / Auth tiles. */
    get: async (): Promise<NexriskConfig> => {
      const raw = await fetchAPI<Record<string, unknown>>('/api/v1/settings/nexrisk-raw');
      const wrapped = raw.nexrisk;
      const inner   = wrapped && typeof wrapped === 'object' ? wrapped : raw;
      return inner as NexriskConfig;
    },

    /** GET /nexrisk/history (§ G2) — audit trail covering ALL NexRisk
     *  subsections (alerts, mt5, analysis, detection-system, memory,
     *  llm-system, nexday, telegram, webhooks). Newest-first. Panels that
     *  want a single subsection filter client-side on entry.subsection. */
    history: (params?: SettingsHistoryParams) =>
      fetchAPI<SettingsHistoryResponse>(
        `/api/v1/settings/nexrisk/history${historyQuery(params)}`),

    /** PUT /nexrisk/auth — token TTLs, issuer, password policy.
     *  All fields require a nexrisk_service restart to apply. */
    updateAuth: (body: AuthConfig) =>
      fetchAPI<SettingsManagerEnvelope>('/api/v1/settings/nexrisk/auth', {
        method: 'PUT',
        body:   JSON.stringify(body),
      }),

    /** PUT /nexrisk/trading-economics — calendar feed config.
     *  Caller MUST omit api_key (or send null) to keep existing. Never send
     *  the masked "***" value back — it would be written as-is. */
    updateTradingEconomics: (patch: TradingEconomicsUpdateBody) =>
      fetchAPI<SettingsManagerEnvelope>('/api/v1/settings/nexrisk/trading-economics', {
        method: 'PUT',
        body:   JSON.stringify(patch),
      }),

    /** PUT /nexrisk/nexday — market-data integration config.
     *  Caller MUST omit license_id (or send null) to keep existing. Nested
     *  sub-objects (polling, retention, hedging) are sent whole. */
    updateNexday: (patch: NexdayUpdateBody) =>
      fetchAPI<SettingsManagerEnvelope>('/api/v1/settings/nexrisk/nexday', {
        method: 'PUT',
        body:   JSON.stringify(patch),
      }),

    /** PUT /nexrisk/alerts — global alert policy. Four scalars, no secrets. */
    updateAlerts: (patch: AlertsUpdateBody) =>
      fetchAPI<SettingsManagerEnvelope>('/api/v1/settings/nexrisk/alerts', {
        method: 'PUT',
        body:   JSON.stringify(patch),
      }),

    /** PUT /nexrisk/telegram — core Telegram config. Caller MUST omit
     *  bot_token (or send null) to keep existing. chats can be omitted;
     *  use the chat CRUD endpoints for chat-level changes. */
    updateTelegram: (patch: TelegramUpdateBody) => {
      // Write-preserve: only forward bot_token when it's a real token. A blank
      // or masked value is dropped so it can never overwrite the stored secret.
      const body: TelegramUpdateBody = { ...patch };
      if (!isBotTokenShaped(body.bot_token)) delete body.bot_token;
      return fetchAPI<SettingsManagerEnvelope>('/api/v1/settings/nexrisk/telegram', {
        method: 'PUT',
        body:   JSON.stringify(body),
      });
    },

    /** PUT /nexrisk/webhooks — core webhook switches. Use the endpoint
     *  CRUD for endpoint-level changes. */
    updateWebhooks: (patch: WebhooksUpdateBody) =>
      fetchAPI<SettingsManagerEnvelope>('/api/v1/settings/nexrisk/webhooks', {
        method: 'PUT',
        body:   JSON.stringify(patch),
      }),
  },

  // ── Telegram CRUD + probes (§ 4) ──────────────────────────────
  telegram: {
    /** POST /nexrisk/telegram/validate — verify a bot token works.
     *  501 today; returns a discriminated ApiResult so the UI can render
     *  a "not implemented yet" badge. */
    validate: (bot_token: string) => {
      // Send the typed value only when it's a real token; otherwise omit it so
      // the backend validates the stored token. Defends against a masked/blank
      // value reaching the wire regardless of the caller.
      const body = isBotTokenShaped(bot_token) ? { bot_token } : {};
      return fetchWithStub<TelegramValidateResponse>('/api/v1/settings/nexrisk/telegram/validate', {
        method: 'POST',
        body:   JSON.stringify(body),
      });
    },

    /** POST /nexrisk/telegram/resolve-chat — convert @handle to numeric id.
     *  501 today; 200 returns { chat_id, title, type }. */
    resolveChat: (username_or_link: string) =>
      fetchWithStub<TelegramResolveResponse>('/api/v1/settings/nexrisk/telegram/resolve-chat', {
        method: 'POST',
        body:   JSON.stringify({ username_or_link }),
      }),

    /** POST /nexrisk/telegram/test — send an actual Telegram message.
     *  501 today; 200 returns { ok, message_id }. */
    test: (chat_id: string, message: string) =>
      fetchWithStub<TelegramTestResponse>('/api/v1/settings/nexrisk/telegram/test', {
        method: 'POST',
        body:   JSON.stringify({ chat_id, message }),
      }),

    /** POST /nexrisk/telegram/chats — create a chat. Server assigns id. */
    addChat: (body: TelegramChatCreateBody) =>
      fetchAPI<TelegramChatCreateResponse>('/api/v1/settings/nexrisk/telegram/chats', {
        method: 'POST',
        body:   JSON.stringify(body),
      }),

    /** PUT /nexrisk/telegram/chats/:id — partial patch. */
    updateChat: (id: string, patch: TelegramChatUpdateBody) =>
      fetchAPI<SettingsManagerEnvelope>(`/api/v1/settings/nexrisk/telegram/chats/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body:   JSON.stringify(patch),
      }),

    /** DELETE /nexrisk/telegram/chats/:id */
    deleteChat: (id: string) =>
      fetchAPI<SettingsManagerEnvelope>(`/api/v1/settings/nexrisk/telegram/chats/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },

  // ── Webhook endpoint CRUD + test (§ 5) ────────────────────────
  webhooks: {
    /** POST /nexrisk/webhooks/endpoints — create an endpoint. */
    addEndpoint: (body: WebhookEndpointCreateBody) =>
      fetchAPI<WebhookEndpointCreateResponse>('/api/v1/settings/nexrisk/webhooks/endpoints', {
        method: 'POST',
        body:   JSON.stringify(body),
      }),

    /** PUT /nexrisk/webhooks/endpoints/:id — partial patch. */
    updateEndpoint: (id: string, patch: WebhookEndpointUpdateBody) =>
      fetchAPI<SettingsManagerEnvelope>(`/api/v1/settings/nexrisk/webhooks/endpoints/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body:   JSON.stringify(patch),
      }),

    /** DELETE /nexrisk/webhooks/endpoints/:id */
    deleteEndpoint: (id: string) =>
      fetchAPI<SettingsManagerEnvelope>(`/api/v1/settings/nexrisk/webhooks/endpoints/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),

    /** POST /nexrisk/webhooks/endpoints/:id/test — fire a real HTTP request.
     *  501 today. */
    testEndpoint: (id: string) =>
      fetchWithStub<WebhookTestResponse>(`/api/v1/settings/nexrisk/webhooks/endpoints/${encodeURIComponent(id)}/test`, {
        method: 'POST',
      }),
  },

  // ── Secret rotation (§ 10) — root only. Paths live under /settings/auth/rotate/*
  //    in the backend (not /settings/*), but registered from the same BFF
  //    routes file for thematic coherence in the System Administration surface.
  rotation: {
    /** POST /settings/auth/rotate/internal-secret — rotates NEXRISK_INTERNAL_SECRET.
     *  Restarts BOTH nexrisk_service AND the BFF. Update the env var in
     *  BOTH places before restarting nexrisk, or the BFF→backend link
     *  breaks. new_secret is returned exactly once. */
    rotateInternalSecret: () =>
      fetchAPI<RotateInternalResponse>('/api/v1/settings/auth/rotate/internal-secret', {
        method: 'POST',
        body:   JSON.stringify({ confirm: true }),
      }),

    /** POST /settings/auth/rotate/jwt-secret — rotates NEXRISK_JWT_SECRET.
     *  Restarts nexrisk_service. All access tokens become invalid on
     *  restart; refresh tokens remain valid until their own expiry. */
    rotateJwtSecret: () =>
      fetchAPI<RotateJwtResponse>('/api/v1/settings/auth/rotate/jwt-secret', {
        method: 'POST',
        body:   JSON.stringify({ confirm: true }),
      }),

    /** GET /settings/auth/rotate/encryption-key/preflight — read-only probe.
     *  Returns counts of LP accounts and TOTP-enrolled users, plus
     *  ok_to_proceed and any blockers. Shown before the destructive
     *  rotation so the operator sees scope and duration up front. */
    encryptionKeyPreflight: () =>
      fetchAPI<EncryptionKeyPreflight>('/api/v1/settings/auth/rotate/encryption-key/preflight'),

    /** POST /settings/auth/rotate/encryption-key — 501 today. When wired, body
     *  is { confirm: true, confirmation_phrase: "ROTATE ENCRYPTION KEY" }.
     *  Re-encrypts all LP credentials and TOTP secrets with the new key. */
    rotateEncryptionKey: () =>
      fetchAPI<RotateEncryptionResponse>('/api/v1/settings/auth/rotate/encryption-key', {
        method: 'POST',
        body:   JSON.stringify({
          confirm:              true,
          confirmation_phrase:  'ROTATE ENCRYPTION KEY',
        }),
      }),
  },
};
// ════════════════════════════════════════════════════════════════════════════
// Alerts Bar
// ════════════════════════════════════════════════════════════════════════════

export interface AlertsBarCell {
  cell_index:  number;
  source_type: 'mt5';                     // 'lp' reserved for future, not exposed in v1
  source_id:   string;                    // == MT5 node_name; opaque (may contain spaces)
  symbol:      string;
  created_at?: string;
  updated_at?: string;
}

export interface AlertsBarCellsResponse {
  user_id:   string;
  max_cells: number;
  cells:     AlertsBarCell[];
}

export interface AlertsBarSaveResponse {
  status:     'OK';
  cell_count: number;
  max_cells:  number;
}

export interface AlertsBarSavePayload {
  cells: { source_type: 'mt5'; source_id: string; symbol: string }[];
}

export const alertsBarApi = {
  /** Restore the current user's saved cells (sorted by cell_index ascending). */
  getCells: () =>
    fetchAPI<AlertsBarCellsResponse>('/api/v1/alerts-bar/cells'),

  /**
   * Replace the user's cells with the supplied array.
   * cell_index is derived from array order. Empty array clears the bar.
   */
  saveCells: (payload: AlertsBarSavePayload) =>
    fetchAPI<AlertsBarSaveResponse>('/api/v1/alerts-bar/cells', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};

// ── Quote / node-status WebSocket events ─────────────────────────────────────

/** Tick payload published by the C++ MT5 publisher. Forward-compatible. */
export interface QuoteTick {
  symbol:        string;
  bid:           number;
  ask:           number;
  last?:         number;
  volume?:       number;
  datetime?:     number;        // seconds
  datetime_msc?: number;        // milliseconds
  flags?:        number;
  flag_names?:   string[];
}

export type AlertsBarWsEvent =
  | { kind: 'quote';        sourceId: string; symbol: string; tick: QuoteTick; timestampMs: number }
  | { kind: 'node_status';  nodeId: number; status: string };

/**
 * Open a managed WebSocket dedicated to the Alerts Bar.
 *
 * Receives all `quote.{source_id}.{symbol}` envelopes and `mt5.node_status`
 * envelopes from the BFF (which fans out everything from the backend).
 * Subscribe messages are sent for symmetry with the existing pattern; the
 * BFF ignores them.
 *
 * Topic parsing uses the LAST dot to separate symbol so a source_id with a
 * dot in it would still parse correctly. (MT5 symbols never contain dots.)
 *
 * @returns cleanup function — call it from useEffect cleanup to close.
 */
export function connectAlertsBarWebSocket(
  onEvent: (event: AlertsBarWsEvent) => void,
  onStatus?: (status: 'open' | 'closed' | 'error') => void
): () => void {
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const TOPIC_RE = /^quote\.(.+)\.([^.]+)$/;

  function connect() {
    if (destroyed) return;
    ws = new WebSocket(`${WS_BASE}/ws/v1/mt5/events`);

    ws.onopen = () => {
      onStatus?.('open');
      // Polite no-op: BFF fans out everything regardless. Kept for parity.
      ws?.send(JSON.stringify({ type: 'subscribe', topics: ['mt5.node_status'] }));
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      let env: { topic?: string; type?: string; data?: unknown; timestamp_ms?: number };
      try { env = JSON.parse(ev.data); } catch { return; }
      const topic = env.topic;
      if (typeof topic !== 'string') return;

      // Quote tick
      if (topic.startsWith('quote.')) {
        const m = topic.match(TOPIC_RE);
        if (!m) return;
        const [, sourceId, symbol] = m;
        const tick = env.data as QuoteTick | undefined;
        if (!tick || typeof tick.ask !== 'number') return;
        onEvent({
          kind: 'quote',
          sourceId,
          symbol,
          tick,
          timestampMs: env.timestamp_ms ?? Date.now(),
        });
        return;
      }

      // Node status change (offline/online detection)
      if (topic === 'mt5.node_status') {
        const data = env.data as { type?: string; node_id?: number; status?: string } | undefined;
        if (data?.type === 'NODE_STATUS_CHANGE' && typeof data.node_id === 'number' && data.status) {
          onEvent({ kind: 'node_status', nodeId: data.node_id, status: data.status });
        }
      }
    };

    ws.onerror = () => onStatus?.('error');
    ws.onclose = () => {
      onStatus?.('closed');
      if (!destroyed) retryTimer = setTimeout(connect, 5000);
    };
  }

  connect();

  return () => {
    destroyed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'Client disconnecting');
    }
  };
}
// ════════════════════════════════════════════════════════════════════════════
// System Health (system.health topic) — see system_health_ws_api.md
// ════════════════════════════════════════════════════════════════════════════

export interface SystemHealthMaster {
  name:      string;   // empty string when unconfigured
  connected: boolean;
}

export interface SystemHealthMetrics {
  cpu_saturation_pct:   number;
  memory_pressure_pct:  number;
  disk_io_latency_ms:   number;
  mt5_rtt_ms:           number;
  lp_execution_rtt_ms:  number | null;
  lp_execution_lp_id:   string | null;
  lp_execution_age_ms:  number | null;
  packet_loss_pct:      number;
}

export interface SystemHealthThreshold {
  warn:  number;
  alert: number;
}

export interface SystemHealthThresholds {
  cpu_saturation_pct:   SystemHealthThreshold;
  memory_pressure_pct:  SystemHealthThreshold;
  disk_io_latency_ms:   SystemHealthThreshold;
  mt5_rtt_ms:           SystemHealthThreshold;
  lp_execution_rtt_ms:  SystemHealthThreshold;
  packet_loss_pct:      SystemHealthThreshold;
}

export interface SystemHealthPayload {
  type:       'SNAPSHOT';
  as_of:      string;
  master:     SystemHealthMaster;
  metrics:    SystemHealthMetrics;
  thresholds: SystemHealthThresholds;
}

export type SystemHealthWsStatus = 'open' | 'closed' | 'error';

/**
 * Open a managed WebSocket dedicated to the `system.health` feed.
 *
 * Receives 1 Hz SNAPSHOT envelopes from the C++ SystemHealthMonitor via the
 * BFF proxy. The subscribe message is a polite no-op — the BFF holds a shared
 * backend subscription and fans out everything from it.
 *
 * Reconnect: exponential backoff 1s → 2s → 4s … cap 30s (per spec §7.1).
 *
 * @returns cleanup function — call from useEffect cleanup to close.
 */
export function connectSystemHealthWebSocket(
  onPayload: (payload: SystemHealthPayload) => void,
  onStatus?: (status: SystemHealthWsStatus) => void,
): () => void {
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let attempt = 0;

  function backoffMs(): number {
    // 1s, 2s, 4s, 8s, 16s, 30s cap
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }

  function connect() {
    if (destroyed) return;
    ws = new WebSocket(`${WS_BASE}/ws/v1/mt5/events`);

    ws.onopen = () => {
      attempt = 0;
      onStatus?.('open');
      // Polite no-op: BFF fans out everything regardless. Kept for parity.
      ws?.send(JSON.stringify({ type: 'subscribe', topics: ['system.health'] }));
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      let env: { topic?: string; type?: string; data?: unknown };
      try { env = JSON.parse(ev.data); } catch { return; }
      if (env.topic !== 'system.health') return;
      const payload = env.data as SystemHealthPayload | undefined;
      if (!payload || typeof payload !== 'object') return;
      onPayload(payload);
    };

    ws.onerror = () => onStatus?.('error');
    ws.onclose = () => {
      onStatus?.('closed');
      if (!destroyed) {
        const wait = backoffMs();
        attempt += 1;
        retryTimer = setTimeout(connect, wait);
      }
    };
  }

  connect();

  return () => {
    destroyed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'Client disconnecting');
    }
  };
}
// ============================================
// Alert Thresholds (§ system_health.json)
//
// Append to src/services/api.ts. Two reasons this does not simply reuse
// fetchAPI for both calls:
//
//   1. fetchAPI throws `new Error(body.error ?? 'HTTP n')` on any non-2xx.
//      That is right for the GET — a failed load is a failed load — but it
//      discards the 422 `errors[]` array, which is the entire mechanism for
//      putting a validation message next to the field that caused it.
//   2. fetchWithStub keeps `status` but still flattens the body to a single
//      `message` string, so it loses errors[] too.
//
// So the GET uses fetchAPI and the PUT uses a local helper returning a
// discriminated union, following the precedent fetchWithStub already set for
// 501s. Neither existing helper is modified.
//
// Do NOT run snakeToCamel over these responses: `rows` is keyed by row code
// (D3_stale_ticks) and each row's `fields` are keyed by field name
// (stale_secs). Those keys are the write-request keys — camel-casing them
// breaks the PUT round trip.
// ============================================

export type ThresholdFieldType = 'integer' | 'number' | 'boolean' | 'string';

export interface ConfigField {
  key:      string;
  label:    string;
  type:     ThresholdFieldType;
  unit?:    string;
  running:  number | boolean | string;
  file:     number | boolean | string | null;
  default:  number | boolean | string;
  min?:     number;
  max?:     number;
  help?:    string;
  /** Enum members, served rather than hardcoded (telegram_severity). */
  options?: string[];
  readonly?: boolean;
  /** Served warning shown beside the input. Not emitted by the master yet. */
  caution?: string;
}

export type RowSource     = 'config' | 'db' | 'witness';
export type RowStatus     = 'built' | 'parked' | 'dropped';
export type TunableClass  = 1 | 2 | 3;

export interface ConfigRow {
  row:          string;
  group:        string;
  label:        string;
  description?: string;
  source:       RowSource;
  status:       RowStatus;
  tunable_class: TunableClass;
  editable:     boolean;
  supports_enable_toggle?: boolean;
  /** Where a non-editable row is actually changed, in words. */
  edit_location?: string;
  /** In-app route for edit_location, when there is one. */
  edit_href?:     string;
  // No row-level `enabled` — the switch reads the field of that name:
  //   row.fields.find(f => f.key === 'enabled')
  fields:       ConfigField[];
}

export interface AlertThresholdsConfig {
  node:             { role: string };
  config_path:      string;
  config_present:   boolean;
  config_parseable: boolean;
  restart_required: boolean;
  rows:             ConfigRow[];
  alerting:         Record<string, ConfigField>;
  /** Not returned by the master today. Optional so the section can be absent. */
  sampler?:         Record<string, ConfigField>;
}

/** Field value as sent on the wire. */
export type ThresholdValue = number | boolean | string;

export interface AlertThresholdsWrite {
  rows?:     Record<string, Record<string, ThresholdValue>>;
  alerting?: Record<string, ThresholdValue>;
}

export interface AppliedChange {
  from: ThresholdValue;
  to:   ThresholdValue;
}

export interface AlertThresholdsSaveResponse {
  applied:          Record<string, Record<string, AppliedChange>>;
  unchanged:        string[];
  restart_required: boolean;
  message:          string;
}

export interface ThresholdFieldError {
  row:     string;
  field:   string;
  value:   ThresholdValue;
  reason:  string;
  /** Written to be shown to a user verbatim. Branch on `reason`, never this. */
  message: string;
}

export type SaveThresholdsResult =
  | { kind: 'ok';         data: AlertThresholdsSaveResponse }
  /** 422 — per-field validation. Render each message next to its field. */
  | { kind: 'invalid';    errors: ThresholdFieldError[] }
  /** 403 — below EDIT on alert_thresholds. */
  | { kind: 'forbidden';  message: string }
  /** 400 / 409 / 500 / network. */
  | { kind: 'error';      status: number; message: string };

export const alertThresholdsApi = {
  get: () => fetchAPI<AlertThresholdsConfig>('/api/v1/monitoring/config'),

  /**
   * Send only what changed. Omitted rows and fields are left untouched, and
   * the write is all-or-nothing — there is no partial save to reconcile.
   * Refetch afterwards rather than patching local state from the request body.
   */
  save: async (payload: AlertThresholdsWrite): Promise<SaveThresholdsResult> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/v1/monitoring/config`, {
        method:      'PUT',
        cache:       'no-store',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(payload),
      });
    } catch (e) {
      return {
        kind:    'error',
        status:  0,
        message: e instanceof Error ? e.message : 'Network error',
      };
    }

    const body = await res.json().catch(() => ({} as Record<string, unknown>));

    if (res.ok) return { kind: 'ok', data: body as AlertThresholdsSaveResponse };

    if (res.status === 422 && Array.isArray((body as { errors?: unknown }).errors)) {
      return { kind: 'invalid', errors: (body as { errors: ThresholdFieldError[] }).errors };
    }

    if (res.status === 403) {
      return {
        kind:    'forbidden',
        message: (body as { error?: string }).error ?? 'You do not have permission to change thresholds.',
      };
    }

    return {
      kind:    'error',
      status:  res.status,
      message:
        (body as { message?: string; error?: string }).message ??
        (body as { error?: string }).error ??
        `HTTP ${res.status}`,
    };
  },
};
// ════════════════════════════════════════════════════════════════════════════
// LP Administration (FIX Bridge) — /api/v1/fix/admin/*
//
// Typed against LIVE payloads captured 2026-07-29, not against
// NexRisk_FIX_Bridge_LP_Administration.md — the doc is out of date in several
// places (it shows `trading_config`, per-session `ssl`, ISO timestamps, and a
// `state` field on the config record; none of those exist on the wire).
//
// Envelope: every route under /fix/admin returns { success, data }. The BFF
// passes the C++ body through verbatim, so the browser sees the envelope too.
// fixAdmin() unwraps it and turns { success:false } into a thrown Error.
// ════════════════════════════════════════════════════════════════════════════

/** Canonical provider_type as reported by GET /fix/admin/providers. Not a
 *  closed union: the registered adapter set is a property of the running
 *  fixbridge build, never of the frontend. */
export type LpProviderType  = string;

/** Row from GET /fix/admin/providers — the only source for the Add LP provider list. */
export interface LpProviderInfo {
  provider_type: string;
  display_name: string;
  status: 'production' | 'beta';
  md_session: 'separate' | 'shared' | 'none';
  requires_ssl: boolean;
  provider_settings_keys: string[];
}
export type LpState         = 'DISCONNECTED' | 'STOPPED' | 'CONNECTING' | 'CONNECTED'
                            | 'DEGRADED' | 'QUARANTINED' | 'SESSION_ERROR';
export type LpSessionState  = 'DISCONNECTED' | 'CONNECTING' | 'LOGGED_ON'
                            | 'RECONNECTING' | 'SESSION_ERROR';
export type LpHealthStatus  = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
export type LpEnvironment   = 'SANDBOX' | 'DEMO' | 'PRODUCTION';

/** FIX session block. `depth` appears on md_session only. */
export interface LpSessionConfig {
  host:                string;
  port:                number;
  sender_comp_id:      string;
  target_comp_id:      string;
  fix_version?:        string;
  heartbeat_interval?: number;
  depth?:              number;
}

export interface LpReconnection {
  enabled:          boolean;
  interval_seconds: number;
  max_attempts:     number;
}

/** Credential state only — values are never returned. A `*_set_at` of 0 means
 *  the secret has never been written. */
export interface LpCredentialState {
  trading_password:         string;   // always ""
  trading_password_set_at:  number;   // epoch ms, 0 = never set
  md_password:              string;   // always ""
  md_password_set_at:       number;
  tls_configured:           boolean;
  tls_set_at:               number;
}

/** Full record from GET /fix/admin/lp/{lp_id}.
 *  Note: carries NO session state — live state comes from the health routes. */
export interface LpConfig {
  lp_id:             string;
  lp_name:           string;
  provider_type:     LpProviderType;
  enabled:           boolean;
  auto_connect:      boolean;
  environment:       LpEnvironment | string;
  notes?:            string;
  trading_session:   LpSessionConfig;
  md_session:        LpSessionConfig | null;
  reconnection:      LpReconnection;
  /** Provider-specific bag. REPLACED WHOLESALE on PUT — always spread the
   *  fetched object before overriding keys, or unedited keys are destroyed. */
  provider_settings: Record<string, unknown>;
  credentials:       LpCredentialState;
  created_at:        number;   // epoch ms
  updated_at:        number;   // epoch ms
  created_by:        string;
  updated_by:        string;
}

/** Row from GET /fix/admin/lp. Thinner than LpConfig — no sessions, no state. */
export interface LpListRow {
  lp_id:           string;
  lp_name:         string;
  provider_type:   LpProviderType;
  enabled:         boolean;
  auto_connect:    boolean;
  environment:     LpEnvironment | string;
  credentials_set: boolean;
  created_at:      number;
  updated_at:      number;
}

/** Row from GET /fix/admin/health — the only source of live state for the list. */
export interface LpHealthSummaryRow {
  lp_id:            string;
  health:           LpHealthStatus;
  state:            LpState;
  trading_state:    LpSessionState;
  md_state:         LpSessionState;
  uptime_seconds:   number;
  errors_24h_count: number;
  warnings_count:   number;
}

export interface LpHealthSession {
  connected: boolean;
  host:      string;
  port:      number;
  state:     LpSessionState;
}

/** GET /fix/admin/lp/{lp_id}/health — adds warnings[] and the rate metrics the
 *  summary route omits. Rate metrics are null until the LP has traded. */
export interface LpHealthDetail {
  lp_id:             string;
  lp_name:           string;
  health:            LpHealthStatus;
  state:             LpState;
  trading_session:   LpHealthSession;
  md_session:        LpHealthSession | null;
  avg_latency_ms:    number | null;
  fill_rate_pct:     number | null;
  reject_rate_pct:   number | null;
  last_connected_at: number;   // epoch ms, 0 = never
  uptime_seconds:    number;
  errors_24h_count:  number;
  warnings:          { code: string; message: string }[];
  warnings_count:    number;
}

export type LpTestScope       = 'BOTH' | 'TRADING_ONLY' | 'MD_ONLY';
export type LpTestSessionCode = 'OK' | 'FAILED' | 'TIMEOUT' | 'SKIPPED';
export type LpTestErrorCode   = 'CONFIG_INVALID' | 'CREDENTIALS_MISSING'
                              | 'TCP_CONNECT_FAILED' | 'LOGON_TIMEOUT' | 'LOGON_REJECTED';

export interface LpTestSession {
  result:              LpTestSessionCode;
  latency_ms:          number | null;      // null on anything but OK
  fix_logon_accepted?: boolean;
  server_comp_id?:     string;
  /** Written for operators. Surface verbatim rather than inventing copy. */
  message?:            string;
  error?:              string;
  error_code?:         LpTestErrorCode;
}

/** POST /fix/admin/lp/{lp_id}/test.
 *  A SKIPPED session does not block overall PASS — never render SKIPPED as
 *  healthy or the operator reads "not tested" as "working". */
export interface LpTestResult {
  lp_id:           string;
  test_scope:      LpTestScope;
  overall:         'PASS' | 'PARTIAL' | 'FAIL';
  tested_at:       number;   // epoch ms
  trading_session: LpTestSession;
  md_session?:     LpTestSession;
}

/** Body for PUT /fix/admin/lp/{lp_id}. Partial — send only what changed.
 *  lp_id and provider_type are IMMUTABLE; including either returns 400. */
export interface LpUpdateBody {
  lp_name?:           string;
  enabled?:           boolean;
  auto_connect?:      boolean;
  environment?:       string;
  notes?:             string;
  trading_session?:   Partial<LpSessionConfig>;
  md_session?:        Partial<LpSessionConfig>;
  reconnection?:      Partial<LpReconnection>;
  provider_settings?: Record<string, unknown>;
}

/** `changed_fields` is the write receipt — dotted paths the backend actually
 *  accepted. A field you sent that is missing from it was silently dropped. */
export interface LpUpdateResponse {
  lp_id:          string;
  changed_fields: string[];
  message:        string;
}

export interface LpCreateBody extends LpUpdateBody {
  lp_id:         string;
  provider_type: LpProviderType;
}

/** Write body for PUT .../credentials.
 *  Field names follow the `<session>_password` convention the backend uses on
 *  read. An earlier revision sent `password` for the trading secret; that key
 *  was silently ignored while `md_password` was accepted, leaving
 *  trading_password_set_at at 0 with no error raised. Callers must verify the
 *  write by re-reading the record and checking the matching `*_set_at`
 *  advanced — a credentials write reports success either way. */
export interface LpCredentialsBody {
  /** FIX logon password for the trading session. */
  trading_password?: string;
  /** Separate market-data password, where the provider uses one. */
  md_password?:      string;
  username?:         string;
  brand?:            string;
}

// ── envelope unwrap ─────────────────────────────────────────────
// fetchAPI already throws on non-2xx (reading `error` off the body, which
// matches the C++ failure shape). This adds the success-false guard for the
// 200-with-success-false case and strips the data wrapper.

async function fixAdmin<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const json = await fetchAPI<{ success?: boolean; data?: T; error?: string }>(endpoint, init);
  if (json && typeof json === 'object' && json.success === false) {
    throw new Error(json.error || 'Request failed');
  }
  return (json?.data ?? json) as unknown as T;
}

const lpPath = (id: string) => `/api/v1/fix/admin/lp/${encodeURIComponent(id)}`;

export const lpAdminApi = {
  /** Adapters compiled into the running bridge. Drives the Add LP provider
   *  picker and the per-provider settings inputs. */
  providers: () =>
    fixAdmin<{ providers: LpProviderInfo[] }>('/api/v1/fix/admin/providers'),

  /** List rows carry no session detail — pair with health() for the list view. */
  list: () =>
    fixAdmin<{ lps: LpListRow[]; total: number }>('/api/v1/fix/admin/lp'),

  /** Authoritative record. This is the only source of truth for the config
   *  form — never render unsaved local state as if it were stored. */
  get: (lp_id: string) =>
    fixAdmin<LpConfig>(lpPath(lp_id)),

  create: (body: LpCreateBody) =>
    fixAdmin<{ lp_id: string; message?: string }>('/api/v1/fix/admin/lp', {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

  /** Partial update. Caller must strip lp_id / provider_type and must spread
   *  the fetched provider_settings before overriding keys. Check the returned
   *  changed_fields against what you intended to write. */
  update: (lp_id: string, body: LpUpdateBody) =>
    fixAdmin<LpUpdateResponse>(lpPath(lp_id), {
      method: 'PUT',
      body:   JSON.stringify(body),
    }),

  remove: (lp_id: string) =>
    fixAdmin<{ lp_id: string; message?: string }>(lpPath(lp_id), { method: 'DELETE' }),

  /** Passwords are written here, never through update(). Stored encrypted. */
  setCredentials: (lp_id: string, body: LpCredentialsBody) =>
    fixAdmin<{ lp_id: string; message?: string }>(`${lpPath(lp_id)}/credentials`, {
      method: 'PUT',
      body:   JSON.stringify(body),
    }),

  /** Opens a real TCP socket and requires a FIX Logon (35=A) back, so a bad
   *  host genuinely fails. Scope is not selectable: the BFF route does not
   *  forward a body, so the backend default (BOTH) always applies. */
  test: (lp_id: string) =>
    fixAdmin<LpTestResult>(`${lpPath(lp_id)}/test`, { method: 'POST' }),

  /** Applies a saved config to the running session. A save alone does not
   *  take effect until this runs. */
  reload: (lp_id: string) =>
    fixAdmin<{ lp_id: string; message?: string }>(`${lpPath(lp_id)}/reload`, { method: 'POST' }),

  healthDetail: (lp_id: string) =>
    fixAdmin<LpHealthDetail>(`${lpPath(lp_id)}/health`),

  health: () =>
    fixAdmin<{ lps: LpHealthSummaryRow[] }>('/api/v1/fix/admin/health'),

  // NOTE: GET /fix/admin/lp/{id}/audit is a stub that always returns an empty
  // array. The replacement is /api/v1/audit/logs?category=LP_ADMIN&lp_id=…,
  // which is not typed here yet — no live payload has been captured.
};

export const lpOpsApi = {
  start: (lp_id: string) =>
    fixAdmin<{ lp_id: string; message?: string }>(
      `/api/v1/fix/lp/${encodeURIComponent(lp_id)}/start`, { method: 'POST' }),

  stop: (lp_id: string) =>
    fixAdmin<{ lp_id: string; message?: string }>(
      `/api/v1/fix/lp/${encodeURIComponent(lp_id)}/stop`, { method: 'POST' }),
};
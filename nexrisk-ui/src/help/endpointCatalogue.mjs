// help/endpointCatalogue.mjs
// The complete set of READ-ONLY endpoints the agent may call, derived from the
// Taiga Frontend Endpoint Index. THIS LIST IS THE WHITELIST — if a path is not
// here, it cannot be called. Secret/credential/token routes (e.g. auth TOTP,
// credential writes, api-key) are deliberately absent. All entries are GET.
//
// Each entry: { id, path, params?, purpose, group }
//   path uses :param placeholders the planner fills via `params`.
//   base '/api/v1' is implied except where the source uses a bare base (feeds,
//   group-spreads, price-rules/*) — those carry an explicit `base` note.

export const ENDPOINTS = [
  // ── Portfolio & P&L ─────────────────────────────────────────────
  { id: 'portfolio_summary', path: '/api/v1/portfolio/summary', params: { period: 'today|week|month (default today)' },
    purpose: "Profit & loss across A/B/C books for a period: net P&L, floating, realized, volumes, revenue. Use for 'how much are we making', profitability, today's/this month's P&L.", group: 'portfolio' },
  { id: 'portfolio_pnl_history', path: '/api/v1/portfolio/pnl-history', params: { from: 'YYYY-MM-DD?', to: 'YYYY-MM-DD?' },
    purpose: 'Daily cumulative realized P&L series (MTD/YTD). Use for P&L trend/history over dates.', group: 'portfolio' },
  { id: 'book_positions', path: '/api/v1/mt5/nodes/:node_id/books/:book/positions', params: { node_id: 'MT5 node id (e.g. 2, the Master)', book: 'B|A|C' },
    purpose: "Open positions with per-position P&L for one book on one MT5 node: each has symbol, profit, volume_lots, price_open, price_current, action. Use for 'which symbol is making/losing money', per-symbol P&L, biggest winners/losers, exposure by symbol. Sum profit grouped by symbol to get per-symbol totals. Master node is typically id 2, book B is the internalised book.", group: 'portfolio' },

  // ── Charts / aggregates ─────────────────────────────────────────
  { id: 'chart_most_traded', path: '/api/v1/charts/most-traded-symbols', params: { from: '?', to: '?', limit: '?' },
    purpose: 'Most traded B-Book symbols by volume. Use for busiest/top symbols by client volume.', group: 'charts' },
  { id: 'chart_hourly_pnl', path: '/api/v1/charts/hourly-pnl',
    purpose: 'Realized P&L per hour split by book (today), plus a B-book floating snapshot. Use for intraday P&L shape.', group: 'charts' },
  { id: 'chart_symbols_hedge', path: '/api/v1/charts/symbols-hedge',
    purpose: 'Per-symbol B-book traded volume vs LP hedge volume. Use to compute how hedged each symbol is (fully/partially/unhedged).', group: 'charts', compute: 'hedge_pct' },
  { id: 'chart_cost_summary', path: '/api/v1/charts/cost-summary',
    purpose: 'Monthly commissions, swaps, LP commission paid, net hedging revenue. Use for cost/revenue breakdown.', group: 'charts' },
  { id: 'chart_top_holders', path: '/api/v1/charts/top-holders',
    purpose: 'Top client logins by month-to-date traded volume. Use for biggest clients/holders.', group: 'charts' },
  { id: 'chart_net_volume', path: '/api/v1/charts/net-volume-by-book',
    purpose: 'Net traded volume per book (A/B/C). Use for overall net exposure by book.', group: 'charts' },
  { id: 'chart_daily_volumes', path: '/api/v1/charts/daily-volumes',
    purpose: 'Daily volumes per book (MTD). Use for volume-over-time by book.', group: 'charts' },
  { id: 'chart_daily_costs', path: '/api/v1/charts/daily-costs',
    purpose: 'Daily cost breakdown per book (MTD).', group: 'charts' },

  // ── Hedging manager ─────────────────────────────────────────────
  { id: 'hedge_rules', path: '/api/v1/hedge/rules', params: { status: 'ACTIVE|PAUSED|STOPPED?' },
    purpose: "Hedging strategies (rules). Use for 'how many strategies', which are active/paused/stopped, list strategies. Filter with status=ACTIVE for running ones.", group: 'hedge' },
  { id: 'hedge_rule', path: '/api/v1/hedge/rules/:rule_id',
    purpose: 'One hedging strategy in detail.', group: 'hedge' },
  { id: 'hedge_records', path: '/api/v1/hedge/records', params: { from: '?', to: '?', rule_id: '?', hedge_state: '?', mt5_symbol: '?', login_id: '?', hedging_lp_id: '?' },
    purpose: "Executed hedge records with timestamps and fill details. Use for 'last hedge executed', recent hedges, hedge history, per-symbol or per-LP hedges. Sort/filter by the params.", group: 'hedge' },
  { id: 'hedge_record', path: '/api/v1/hedge/records/:record_id',
    purpose: 'One hedge record detail incl. partial-fill chain.', group: 'hedge' },
  { id: 'hedge_escalated', path: '/api/v1/hedge/positions/escalated',
    purpose: "Escalated hedge positions needing attention (data.count drives the badge). Use for 'anything escalated', triage queue size.", group: 'hedge' },
  { id: 'hedge_lp_health', path: '/api/v1/hedge/lp-health', params: { lp_id: '?' },
    purpose: "LP health/quality (latency, fill rate, connection). Use for 'are LPs healthy', LP status.", group: 'hedge' },
  { id: 'hedge_sanity_rule', path: '/api/v1/hedge/rules/:rule_id/sanity-config',
    purpose: 'Route-sanity safeguards for one rule.', group: 'hedge' },
  { id: 'hedge_sanity_default', path: '/api/v1/hedge/sanity-config/default',
    purpose: 'Global default route-sanity safeguards.', group: 'hedge' },

  // ── FIX bridge (admin + operational, read-only) ─────────────────
  { id: 'fix_admin_health', path: '/api/v1/fix/admin/health',
    purpose: "Health summary across all LPs. Use for 'is the bridge up', overall LP connectivity.", group: 'fix' },
  { id: 'fix_admin_lps', path: '/api/v1/fix/admin/lp',
    purpose: 'List LP configurations (non-secret config).', group: 'fix' },
  { id: 'fix_admin_lp', path: '/api/v1/fix/admin/lp/:lp_id',
    purpose: 'One LP configuration (non-secret fields).', group: 'fix' },
  { id: 'fix_admin_lp_health', path: '/api/v1/fix/admin/lp/:lp_id/health',
    purpose: 'Detailed health for one LP.', group: 'fix' },
  { id: 'fix_admin_lp_audit', path: '/api/v1/fix/admin/lp/:lp_id/audit', params: { limit: '?' },
    purpose: 'Config-change audit trail for one LP.', group: 'fix' },
  { id: 'fix_cred_status', path: '/api/v1/fix/admin/lp/:lp_id/credentials/status',
    purpose: "Whether an LP's credentials are configured — STATUS ONLY, never the secret.", group: 'fix' },
  { id: 'fix_status', path: '/api/v1/fix/status',
    purpose: 'Bridge overview status.', group: 'fix' },
  { id: 'fix_lp_status', path: '/api/v1/fix/lp/:lp_id',
    purpose: 'One LP status.', group: 'fix' },
  { id: 'fix_lp_capabilities', path: '/api/v1/fix/lp/:lp_id/capabilities',
    purpose: 'LP capabilities.', group: 'fix' },
  { id: 'fix_lp_instruments', path: '/api/v1/fix/lp/:lp_id/instruments',
    purpose: 'Instruments available at an LP.', group: 'fix' },
  { id: 'fix_lp_instrument', path: '/api/v1/fix/lp/:lp_id/instruments/:symbol',
    purpose: 'One instrument detail at an LP.', group: 'fix' },
  { id: 'fix_lp_instruments_summary', path: '/api/v1/fix/lp/:lp_id/instruments/summary',
    purpose: 'Instrument summary at an LP.', group: 'fix' },
  { id: 'fix_lp_prices', path: '/api/v1/fix/lp/:lp_id/md/prices',
    purpose: 'Best bid/ask prices at an LP.', group: 'fix' },
  { id: 'fix_lp_book', path: '/api/v1/fix/lp/:lp_id/md/book/:symbol',
    purpose: 'Order book (depth) for a symbol at an LP.', group: 'fix' },
  { id: 'fix_lp_books', path: '/api/v1/fix/lp/:lp_id/md/books',
    purpose: 'All subscribed books at an LP.', group: 'fix' },
  { id: 'fix_lp_orders', path: '/api/v1/fix/lp/:lp_id/orders', params: { active: 'true?' },
    purpose: 'Orders at an LP (active=true for open only).', group: 'fix' },
  { id: 'fix_lp_order', path: '/api/v1/fix/lp/:lp_id/orders/:clord_id',
    purpose: 'One order at an LP.', group: 'fix' },
  { id: 'fix_lp_positions', path: '/api/v1/fix/lp/:lp_id/positions',
    purpose: 'Open positions at an LP.', group: 'fix' },
  { id: 'fix_lp_positions_summary', path: '/api/v1/fix/lp/:lp_id/positions/summary',
    purpose: 'Position summary at an LP.', group: 'fix' },
  { id: 'fix_lp_position', path: '/api/v1/fix/lp/:lp_id/positions/:position_id',
    purpose: 'One position at an LP.', group: 'fix' },
  { id: 'fix_lp_account', path: '/api/v1/fix/lp/:lp_id/account',
    purpose: 'Account status at an LP (balance/margin where supported).', group: 'fix' },
  { id: 'fix_lp_trades', path: '/api/v1/fix/lp/:lp_id/trades',
    purpose: 'Trade history at an LP.', group: 'fix' },
  { id: 'fix_lp_routes', path: '/api/v1/fix/lp/:lp_id/routes',
    purpose: 'Route status at an LP.', group: 'fix' },
  { id: 'fix_client_stats', path: '/api/v1/fix/client/stats',
    purpose: 'FIX event counters — WS/bridge health check.', group: 'fix' },

  // ── Risk matrix (behaviour rules / PF bands) ────────────────────
  { id: 'risk_matrix', path: '/api/v1/config/risk-matrix',
    purpose: 'All active risk-matrix rules (flat + grouped). Use for risk policy rules overview.', group: 'risk' },
  { id: 'risk_matrix_behavior', path: '/api/v1/config/risk-matrix/behavior/:type',
    purpose: 'Risk rules for one behaviour type.', group: 'risk' },
  { id: 'risk_matrix_history', path: '/api/v1/config/risk-matrix/history', params: { limit: '?' },
    purpose: 'Risk-matrix change audit log.', group: 'risk' },
  { id: 'risk_action_codes', path: '/api/v1/config/action-codes',
    purpose: 'All action codes.', group: 'risk' },
  { id: 'risk_modifier_flags', path: '/api/v1/config/modifier-flags',
    purpose: 'All modifier flags.', group: 'risk' },
  { id: 'risk_rules2', path: '/api/v1/risk-matrix/rules',
    purpose: 'Risk-matrix rules (advanced view, filters).', group: 'risk' },
  { id: 'risk_pf_bands', path: '/api/v1/risk-matrix/pf-bands',
    purpose: 'Profit-factor band ladders grouped by behaviour.', group: 'risk' },
  { id: 'risk_factory_defaults', path: '/api/v1/risk-matrix/factory-defaults',
    purpose: 'Read-only factory default rules.', group: 'risk' },
  { id: 'risk_diff', path: '/api/v1/risk-matrix/diff',
    purpose: 'Current rules vs factory defaults.', group: 'risk' },

  // ── Price rules engine (bare base) ──────────────────────────────
  { id: 'feeds', path: '/api/v1/feeds',
    purpose: 'Price feed configs. Use for feed list/status.', group: 'price', base: 'bare' },
  { id: 'feeds_stats', path: '/api/v1/feeds/stats',
    purpose: 'Price pipeline statistics.', group: 'price', base: 'bare' },
  { id: 'feed', path: '/api/v1/feeds/:feed_id',
    purpose: 'One feed config.', group: 'price', base: 'bare' },
  { id: 'feed_rules', path: '/api/v1/price-rules/feeds/:feed_id/rules',
    purpose: 'Spread rules for a feed.', group: 'price', base: 'bare' },
  { id: 'group_spreads', path: '/api/v1/group-spreads',
    purpose: 'All group spread rules.', group: 'price', base: 'bare' },
  { id: 'group_spreads_group', path: '/api/v1/group-spreads/:group',
    purpose: 'Group spread rules for one MT5 group.', group: 'price', base: 'bare' },
  { id: 'price_news', path: '/api/v1/price-rules/news',
    purpose: 'News-window spread rules.', group: 'price', base: 'bare' },

  // ── LP volume report ────────────────────────────────────────────
  { id: 'lp_volume_report', path: '/api/v1/reports/lp-volume', params: { group_by: '?', period: 'mtd|last_month|custom?', asset_class: '?', lp_id: '?', node_id: '?', from: '?', to: '?' },
    purpose: 'LP volume report, pivotable by lp/node/book/symbol/asset_class/direction/day. Use for volume routed to LPs, per-symbol/per-LP volumes.', group: 'reports' },

  // ── Symbol mapping ──────────────────────────────────────────────
  { id: 'mappings_lp', path: '/api/v1/mappings/lp',
    purpose: 'MT5→LP symbol mappings (with STP fields). Use for how a symbol maps to an LP.', group: 'mapping' },
  { id: 'mappings_lp_unmapped', path: '/api/v1/mappings/lp/unmapped',
    purpose: 'MT5 symbols with no LP mapping (cannot be hedged). Use for unmapped/at-risk symbols.', group: 'mapping' },
  { id: 'mappings_nexday', path: '/api/v1/mappings/nexday',
    purpose: 'MT5→NexDay symbol mappings.', group: 'mapping' },
  { id: 'mappings_nexday_unmapped', path: '/api/v1/mappings/nexday/unmapped',
    purpose: 'MT5 symbols with no NexDay mapping (no predictions).', group: 'mapping' },
  { id: 'mappings_nexday_available', path: '/api/v1/mappings/nexday/available',
    purpose: 'Available NexDay symbols to map to.', group: 'mapping' },
  { id: 'mappings_unmapped', path: '/api/v1/mappings/unmapped',
    purpose: 'All unmapped MT5 symbols.', group: 'mapping' },
  { id: 'mappings_history', path: '/api/v1/mappings/history', params: { type: 'lp|nexday?', limit: '?' },
    purpose: 'Symbol-mapping upload history.', group: 'mapping' },

  // ── Calendar ────────────────────────────────────────────────────
  { id: 'calendar_events', path: '/api/v1/calendar/events',
    purpose: 'Economic calendar events (upcoming/recent news). Use for upcoming high-impact news, event schedule.', group: 'calendar' },
  { id: 'calendar_event', path: '/api/v1/calendar/events/:id',
    purpose: 'One calendar event detail.', group: 'calendar' },

  // ── MT5 nodes ───────────────────────────────────────────────────
  { id: 'mt5_nodes', path: '/api/v1/mt5/nodes',
    purpose: 'Connected MT5 nodes/sources and their status. Use for which MT5 servers are connected, master status.', group: 'mt5' },
  { id: 'mt5_node_symbols', path: '/api/v1/mt5/nodes/:node_id/symbols',
    purpose: 'Symbols available on an MT5 node.', group: 'mt5' },

  // ── Settings status (config state; secrets redacted) ────────────
  { id: 'settings', path: '/api/v1/settings',
    purpose: 'Global platform settings state.', group: 'settings' },
  { id: 'settings_pending_restart', path: '/api/v1/settings/pending-restart',
    purpose: "Whether a settings change needs a restart. Use for 'is a restart pending'.", group: 'settings' },
  { id: 'settings_nexrisk', path: '/api/v1/settings/nexrisk',
    purpose: 'NexRisk settings (NexDay licence enabled, polling, alerts, MT5, telegram) — status only. Use for is NexDay/telegram/etc configured.', group: 'settings' },
  { id: 'settings_classifier', path: '/api/v1/settings/classifier',
    purpose: 'Classifier settings state.', group: 'settings' },
  { id: 'settings_detection', path: '/api/v1/settings/detection',
    purpose: 'Detection settings/thresholds state.', group: 'settings' },
  { id: 'settings_llm', path: '/api/v1/settings/llm',
    purpose: 'LLM provider/routing settings (keys masked).', group: 'settings' },

  // ── Users & roles (identities, not secrets) ─────────────────────
  { id: 'users', path: '/api/v1/users',
    purpose: 'List platform users and their roles/active status.', group: 'users' },
  { id: 'user', path: '/api/v1/users/:id',
    purpose: 'One user.', group: 'users' },
  { id: 'roles', path: '/api/v1/roles',
    purpose: 'List roles.', group: 'users' },
  { id: 'role_permissions', path: '/api/v1/roles/:id/permissions',
    purpose: 'Permission matrix for a role.', group: 'users' },

  // ── Clustering ──────────────────────────────────────────────────
  { id: 'clustering_profiles', path: '/api/v1/clustering/runs/:run_id/profiles',
    purpose: 'Behavioural cluster profiles for a run.', group: 'intel' },
  { id: 'clustering_assignments', path: '/api/v1/clustering/runs/:run_id/assignments',
    purpose: 'Trader members of clusters for a run.', group: 'intel' },

  // ── Predictions (NexDay forecasts) ──────────────────────────────
  { id: 'pred_intraday_symbol', path: '/api/v1/predictions/intraday/:mt5_symbol',
    purpose: "Intraday NexDay forecast for ONE symbol — all four timeframes (15min/30min/1hour/2hour) in one call: predicted_high, predicted_low, predicted_close, trend, strength, momentum. TAKES AN MT5 SYMBOL (e.g. EURUSD). Use for 'predicted high/low for <symbol> 15min', intraday forecast for a symbol. If unmapped, returns mapped=false.", group: 'predictions' },
  { id: 'pred_intraday_all', path: '/api/v1/predictions/intraday', params: { timeframe: '15min|30min|1hour|2hour (default 15min)' },
    purpose: 'Latest intraday forecast for ALL symbols at one timeframe. Use for market-wide intraday view, or scanning all symbols at 15min/1hour/etc.', group: 'predictions' },
  { id: 'pred_daily_all', path: '/api/v1/predictions/daily',
    purpose: "All symbols' latest DAILY forecast (predicted OHLC, trend, strength, confidence, momentum, 2-day-ahead). Use for daily outlook across the book.", group: 'predictions' },
  { id: 'pred_daily_symbol', path: '/api/v1/predictions/daily/:symbol', params: { limit: '? (max 100)' },
    purpose: "Daily forecast history for one NexDay symbol. TAKES A NEXDAY SYMBOL (e.g. EURUSD.FXCM, not EURUSD) — resolve via nexday mapping first, or prefer pred_intraday_symbol which takes MT5 symbols. 404 on miss.", group: 'predictions' },
  { id: 'pred_signals', path: '/api/v1/predictions/signals', params: { mt5_symbols: 'comma-separated MT5 symbols, e.g. EURUSD,GBPUSD (required)' },
    purpose: "Batch signal per MT5 symbol: Opp@<tf> / Hdg@<tf> / none, with strength and conviction. TAKES MT5 SYMBOLS. Use for 'what's the signal on <symbols>', opportunity vs hedge signal, net-exposure signal column.", group: 'predictions' },
  { id: 'pred_opportunities', path: '/api/v1/opportunities', params: { conviction: '? exact-match filter' },
    purpose: 'Trade opportunities across symbols (conviction, opportunity, recommended_action, risk_reward). Use for best opportunities, what to trade, ranked ideas.', group: 'predictions' },
  { id: 'pred_opportunity_symbol', path: '/api/v1/opportunities/:symbol',
    purpose: 'Opportunity for one NexDay symbol (bare object). TAKES A NEXDAY SYMBOL. 404 on miss.', group: 'predictions' },
  { id: 'pred_tradebook', path: '/api/v1/tradebook',
    purpose: 'Tradebook entries across symbols: action, entry/TP/SL bands, risk_reward. Use for suggested entry/stop/target levels.', group: 'predictions' },
  { id: 'pred_tradebook_symbol', path: '/api/v1/tradebook/:symbol',
    purpose: 'Tradebook for one NexDay symbol (bare object). TAKES A NEXDAY SYMBOL. 404 on miss.', group: 'predictions' },
  { id: 'nexday_symbols', path: '/api/v1/nexday/symbols',
    purpose: 'The NexDay symbol universe (NexDay-keyed names + descriptions). Use to resolve an MT5 symbol to its NexDay symbol, or list available forecast symbols.', group: 'predictions' },
  { id: 'nexday_sync_status', path: '/api/v1/nexday/sync-status',
    purpose: 'Per-endpoint NexDay sync rows (last_sync_at, records, status).', group: 'predictions' },
  { id: 'pred_status', path: '/api/v1/predictions/status',
    purpose: "Predictions freshness/health (ok|pending|degraded, last sync times). Use for 'are predictions up to date', prediction data health.", group: 'predictions' },
];

// Known data gaps — endpoints that DON'T exist yet, so the agent answers honestly
// ("that data isn't exposed to me yet") instead of a generic refusal.
export const KNOWN_GAPS = [
  { topic: 'live tick / current quote for a symbol (spot price right now)',
    note: 'Live quotes stream over WebSocket (quote.{source}.{symbol}), not a REST GET the assistant can call.' },
];

// Build the whitelist regexes straight from the catalogue paths (this IS the gate).
export const READ_WHITELIST = ENDPOINTS.map((e) => {
  const rx = e.path
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')       // escape
    .replace(/:[A-Za-z0-9_]+/g, "[^/?]+");           // :param -> segment
  return new RegExp('^' + rx + '(\\?.*)?$');
});

export function pathAllowed(path) {
  return typeof path === 'string' && READ_WHITELIST.some((rx) => rx.test(path));
}

export function catalogueText() {
  const byGroup = {};
  for (const e of ENDPOINTS) (byGroup[e.group] ||= []).push(e);
  let out = '';
  for (const [g, list] of Object.entries(byGroup)) {
    out += `\n[${g}]\n`;
    for (const e of list) out += `  ${e.id} — ${e.purpose}${e.params ? ` params:${JSON.stringify(e.params)}` : ''}\n`;
  }
  return out.trim();
}

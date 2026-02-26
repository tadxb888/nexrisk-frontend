// ============================================
// Risk Intelligence Center (Focus Page)
// AI-powered trader detection, classification & clustering
// ============================================

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ChevronDown, 
  ChevronRight, 
  Users, 
  AlertTriangle,
  Shield,
  Activity,
  Loader2,
  RefreshCw,
  TrendingUp,
  Clock,
  Target,
  Percent,
  BarChart3,
  Zap
} from 'lucide-react';
import { tradersApi, explanationsApi, clusteringApi } from '@/services/api';
import { useSelectionStore } from '@/stores';
import { clsx } from 'clsx';
import type { Trader, ClusteringRunDetail, ClusterAssignment } from '@/types';

// ============================================
// NexRisk Custom Icons
// ============================================

// AI Insights Icon - replaces Brain
const AIInsightsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} width="16" height="16">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    <circle cx="12" cy="12" r="3" opacity="0.3"/>
    <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" opacity="0.6"/>
  </svg>
);

// Spark/Generate Icon
const SparkIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} width="14" height="14">
    <path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3-3-7z"/>
  </svg>
);

// Copy Icon
const CopyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} width="14" height="14">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

// Check Icon
const CheckIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} width="14" height="14">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// Telegram Icon
const TelegramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} width="14" height="14">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

// ============================================
// MOCK DATA - Remove when API is connected
// ============================================

const MOCK_TRADERS: Trader[] = [
  // CRITICAL
  { login: 7001, name: 'Alpha Scalper Pro', classification: 'LATENCY_ARB', risk_level: 'CRITICAL', risk_score: 94, confidence: 0.97, recommended_action: 'A_BOOK_FULL', has_explanation: true, strategies_count: 3 },
  { login: 7002, name: 'Speed Demon Trading', classification: 'SCALPER', risk_level: 'CRITICAL', risk_score: 91, confidence: 0.95, recommended_action: 'A_BOOK_FULL', has_explanation: true },
  // HIGH
  { login: 7003, name: 'Fast Eddie LLC', classification: 'EA_TRADER', risk_level: 'HIGH', risk_score: 78, confidence: 0.89, recommended_action: 'A_BOOK_PARTIAL', has_explanation: true, strategies_count: 2 },
  { login: 7004, name: 'Grid Master Bot', classification: 'GRID_MARTINGALE', risk_level: 'HIGH', risk_score: 75, confidence: 0.87, recommended_action: 'SPREAD_WIDEN', has_explanation: true },
  { login: 7005, name: 'News Flash Trader', classification: 'NEWS_TRADER', risk_level: 'HIGH', risk_score: 72, confidence: 0.84, recommended_action: 'A_BOOK_PARTIAL', has_explanation: true },
  // MEDIUM
  { login: 7006, name: 'Swing King Capital', classification: 'SWING_TRADER', risk_level: 'MEDIUM', risk_score: 55, confidence: 0.78, recommended_action: 'MONITOR' },
  { login: 7007, name: 'Pattern Seeker', classification: 'MANUAL_RETAIL', risk_level: 'MEDIUM', risk_score: 52, confidence: 0.75, recommended_action: 'MONITOR' },
  { login: 7008, name: 'Rebate Hunter Pro', classification: 'REBATE_HUNTER', risk_level: 'MEDIUM', risk_score: 58, confidence: 0.80, recommended_action: 'SPREAD_WIDEN' },
  { login: 7009, name: 'Momentum Chaser', classification: 'EA_TRADER', risk_level: 'MEDIUM', risk_score: 48, confidence: 0.72, recommended_action: 'MONITOR' },
  { login: 7010, name: 'Range Bound LLC', classification: 'MANUAL_RETAIL', risk_level: 'MEDIUM', risk_score: 45, confidence: 0.70, recommended_action: 'MONITOR' },
  // LOW
  { login: 7011, name: 'Steady Eddie', classification: 'SWING_TRADER', risk_level: 'LOW', risk_score: 25, confidence: 0.92, recommended_action: 'B_BOOK_SAFE' },
  { login: 7012, name: 'Conservative Capital', classification: 'MANUAL_RETAIL', risk_level: 'LOW', risk_score: 18, confidence: 0.95, recommended_action: 'B_BOOK_SAFE' },
  { login: 7013, name: 'Long Term Vision', classification: 'SWING_TRADER', risk_level: 'LOW', risk_score: 22, confidence: 0.90, recommended_action: 'B_BOOK_STD' },
  { login: 7014, name: 'Passive Trader Co', classification: 'MANUAL_RETAIL', risk_level: 'LOW', risk_score: 15, confidence: 0.93, recommended_action: 'B_BOOK_SAFE' },
  { login: 7015, name: 'Weekend Warrior', classification: 'MANUAL_RETAIL', risk_level: 'LOW', risk_score: 20, confidence: 0.88, recommended_action: 'B_BOOK_STD' },
  { login: 7016, name: 'Cautious Carl', classification: 'SWING_TRADER', risk_level: 'LOW', risk_score: 12, confidence: 0.96, recommended_action: 'B_BOOK_SAFE' },
  { login: 7017, name: 'Safe Haven Fund', classification: 'MANUAL_RETAIL', risk_level: 'LOW', risk_score: 8, confidence: 0.98, recommended_action: 'B_BOOK_SAFE' },
  { login: 7018, name: 'Prudent Pete', classification: 'SWING_TRADER', risk_level: 'LOW', risk_score: 14, confidence: 0.94, recommended_action: 'B_BOOK_SAFE' },
  { login: 7019, name: 'Slow and Steady', classification: 'MANUAL_RETAIL', risk_level: 'LOW', risk_score: 10, confidence: 0.97, recommended_action: 'B_BOOK_SAFE' },
  { login: 7020, name: 'Patient Investor', classification: 'SWING_TRADER', risk_level: 'LOW', risk_score: 16, confidence: 0.91, recommended_action: 'B_BOOK_STD' },
  { login: 7021, name: 'Relaxed Trader', classification: 'MANUAL_RETAIL', risk_level: 'LOW', risk_score: 19, confidence: 0.89, recommended_action: 'B_BOOK_STD' },
  { login: 7022, name: 'Calm Waters LLC', classification: 'SWING_TRADER', risk_level: 'LOW', risk_score: 11, confidence: 0.95, recommended_action: 'B_BOOK_SAFE' },
];

const MOCK_EXPLANATIONS: Record<number, {
  current: { risk_level: string; risk_score: number; effective_risk: number; confidence: number; classification: string; recommended_action: string; triggered_rules?: string; template_explanation?: string };
  claude_explanations: Array<{ explanation: string; model: string; is_stale: boolean; stale_warning?: string; generated_at: string }>;
  actions: { show_explain_button: boolean; is_stale: boolean; can_regenerate: boolean };
  behavior_change?: { trend: string; risk_delta?: number };
}> = {
  7001: {
    current: { risk_level: 'CRITICAL', risk_score: 94, effective_risk: 96, confidence: 0.97, classification: 'LATENCY_ARB', recommended_action: 'A_BOOK_FULL', triggered_rules: 'Rule 12: Sub-millisecond execution pattern\nRule 15: Consistent profitable fills\nRule 23: Cross-venue timing correlation' },
    claude_explanations: [{
      explanation: "This trader exhibits classic latency arbitrage behavior with extremely consistent sub-second trade execution patterns. Analysis shows 94% of trades execute within 50ms of price feed updates, with a 89% win rate on these positions.\n\nKey risk indicators:\n• Average hold time of 2.3 seconds suggests tick-scalping\n• Trade timing correlates strongly with LP quote updates\n• Profit distribution shows abnormally tight clustering around 0.8-1.2 pips\n• Symbol rotation pattern indicates systematic cross-venue comparison\n\nRecommended immediate A-Book routing to protect against adverse selection. Consider implementing hold-time rules or asymmetric slippage for this account.",
      model: 'claude-haiku-4.5',
      is_stale: false,
      generated_at: '2026-01-30T10:15:00Z'
    }],
    actions: { show_explain_button: false, is_stale: false, can_regenerate: true },
    behavior_change: { trend: 'INCREASING_RISK', risk_delta: 8.5 }
  },
  7002: {
    current: { risk_level: 'CRITICAL', risk_score: 91, effective_risk: 93, confidence: 0.95, classification: 'SCALPER', recommended_action: 'A_BOOK_FULL', triggered_rules: 'Rule 8: High-frequency scalping detected\nRule 14: Win rate exceeds threshold' },
    claude_explanations: [{
      explanation: "High-frequency scalping pattern detected with 200+ trades per day average. This trader specializes in EURUSD and GBPUSD during high-liquidity London/NY overlap sessions.\n\nBehavior analysis:\n• 85% of positions held under 45 seconds\n• Targets 3-5 pip moves consistently\n• Uses tight 8-pip stops, suggesting EA-driven execution\n• Trade clustering around news events shows news-scalping overlay\n\nThe combination of high win rate (78%) and tight risk management suggests sophisticated algorithmic execution. Full A-Book routing recommended to prevent market maker losses.",
      model: 'claude-haiku-4.5',
      is_stale: false,
      generated_at: '2026-01-30T09:45:00Z'
    }],
    actions: { show_explain_button: false, is_stale: false, can_regenerate: true },
    behavior_change: { trend: 'STABLE' }
  },
  7003: {
    current: { risk_level: 'HIGH', risk_score: 78, effective_risk: 80, confidence: 0.89, classification: 'EA_TRADER', recommended_action: 'A_BOOK_PARTIAL', triggered_rules: 'Rule 5: EA signature detected\nRule 11: Multi-strategy portfolio' },
    claude_explanations: [{
      explanation: "Multi-strategy EA operation detected running at least 2 distinct algorithms simultaneously. Primary strategy appears to be trend-following on H4 timeframe, secondary is mean-reversion on M15.\n\nRisk assessment:\n• 67% profitable trades overall\n• Drawdown patterns suggest martingale elements in recovery\n• Position sizing varies by 3x based on conviction signals\n• Night trading shows different characteristics (likely separate EA)\n\nPartial A-Book (60-70%) recommended for larger positions while monitoring for strategy drift.",
      model: 'claude-haiku-4.5',
      is_stale: false,
      generated_at: '2026-01-30T08:30:00Z'
    }],
    actions: { show_explain_button: false, is_stale: false, can_regenerate: true },
    behavior_change: { trend: 'STABLE' }
  },
  7004: {
    current: { risk_level: 'HIGH', risk_score: 75, effective_risk: 77, confidence: 0.87, classification: 'GRID_MARTINGALE', recommended_action: 'SPREAD_WIDEN', triggered_rules: 'Rule 18: Grid pattern detected\nRule 19: Position averaging behavior' },
    claude_explanations: [{
      explanation: "Grid trading system with martingale recovery elements. Trader opens positions at fixed 25-pip intervals with 1.5x lot multiplier on adverse moves.\n\nRisk characteristics:\n• Maximum observed grid depth: 7 levels\n• Average recovery time: 4-6 hours\n• Exposure can reach 15x initial position\n• Performs well in ranging markets, vulnerable to trends\n\nSpread widening of 1.5-2x recommended during high-volatility events. Consider position limits to cap maximum exposure during grid expansion phases.",
      model: 'claude-haiku-4.5',
      is_stale: false,
      generated_at: '2026-01-30T07:15:00Z'
    }],
    actions: { show_explain_button: false, is_stale: false, can_regenerate: true },
    behavior_change: { trend: 'STABLE' }
  },
  7005: {
    current: { risk_level: 'HIGH', risk_score: 72, effective_risk: 74, confidence: 0.84, classification: 'NEWS_TRADER', recommended_action: 'A_BOOK_PARTIAL', triggered_rules: 'Rule 21: News timing correlation\nRule 22: Volatility spike trading' },
    claude_explanations: [{
      explanation: "Specialized news trading strategy focusing on NFP, FOMC, and ECB announcements. Trader typically positions 30-60 seconds before scheduled releases.\n\nPattern analysis:\n• 92% of trades occur within ±2 minutes of high-impact news\n• Uses straddle approach with pending orders\n• Quick profit-taking (average 45-second holds post-news)\n• Win rate spikes to 73% during news vs 51% other times\n\nPartial A-Book during news windows, consider implementing news blackout periods or delayed execution.",
      model: 'claude-haiku-4.5',
      is_stale: true,
      stale_warning: 'Behavior data updated 3 hours ago. Consider regenerating for current analysis.',
      generated_at: '2026-01-29T18:00:00Z'
    }],
    actions: { show_explain_button: true, is_stale: true, can_regenerate: true },
    behavior_change: { trend: 'DECREASING_RISK', risk_delta: -3.2 }
  },
  // Medium risk - no explanations (on-demand)
  7006: {
    current: { risk_level: 'MEDIUM', risk_score: 55, effective_risk: 55, confidence: 0.78, classification: 'SWING_TRADER', recommended_action: 'MONITOR', template_explanation: 'Swing trading pattern with 2-5 day average hold times. Moderate risk profile suitable for standard B-Book treatment with monitoring.' },
    claude_explanations: [],
    actions: { show_explain_button: true, is_stale: false, can_regenerate: false },
    behavior_change: { trend: 'STABLE' }
  },
  7007: {
    current: { risk_level: 'MEDIUM', risk_score: 52, effective_risk: 52, confidence: 0.75, classification: 'MANUAL_RETAIL', recommended_action: 'MONITOR', template_explanation: 'Manual retail trading pattern. Inconsistent timing suggests discretionary approach. Standard monitoring recommended.' },
    claude_explanations: [],
    actions: { show_explain_button: true, is_stale: false, can_regenerate: false }
  }
};

const MOCK_FEATURES: Record<number, Record<string, number>> = {
  7001: { avg_hold_seconds: 2.3, win_rate: 0.89, profit_factor: 3.45, timing_regularity: 0.94, lot_entropy: 0.12, burst_score: 8.7 },
  7002: { avg_hold_seconds: 38, win_rate: 0.78, profit_factor: 2.15, timing_regularity: 0.87, lot_entropy: 0.23, burst_score: 7.2 },
  7003: { avg_hold_seconds: 4500, win_rate: 0.67, profit_factor: 1.85, timing_regularity: 0.72, lot_entropy: 0.45, burst_score: 3.1 },
  7004: { avg_hold_seconds: 7200, win_rate: 0.71, profit_factor: 1.42, timing_regularity: 0.95, lot_entropy: 0.08, burst_score: 2.8 },
  7005: { avg_hold_seconds: 45, win_rate: 0.65, profit_factor: 1.95, timing_regularity: 0.35, lot_entropy: 0.38, burst_score: 9.1 },
  7006: { avg_hold_seconds: 172800, win_rate: 0.52, profit_factor: 1.25, timing_regularity: 0.28, lot_entropy: 0.62, burst_score: 0.8 },
  7011: { avg_hold_seconds: 259200, win_rate: 0.48, profit_factor: 1.15, timing_regularity: 0.22, lot_entropy: 0.71, burst_score: 0.3 },
};

const MOCK_CLUSTERS = [
  { cluster_id: 0, member_count: 8, label_hint: 'MICRO_SCALPER', archetype_code: 'MICRO SCALPER', archetype_name: 'Micro Scalpers', risk_severity: 0.85, avg_risk_score: 82, description: 'Ultra-short hold times (<30s), high-frequency execution patterns', members: [7001, 7002, 7023, 7024, 7025, 7026, 7027, 7028] },
  { cluster_id: 1, member_count: 5, label_hint: 'EA_BOT_REGULAR', archetype_code: 'EA BOT REGULAR', archetype_name: 'EA Bot (Regular)', risk_severity: 0.55, avg_risk_score: 58, description: 'Automated trading with consistent execution signatures', members: [7003, 7009, 7029, 7030, 7031] },
  { cluster_id: 2, member_count: 4, label_hint: 'GRID_MARTINGALE', archetype_code: 'GRID MARTINGALE', archetype_name: 'Grid / Martingale', risk_severity: 0.75, avg_risk_score: 71, description: 'Position averaging and grid-based recovery systems', members: [7004, 7032, 7033, 7034] },
  { cluster_id: 3, member_count: 12, label_hint: 'SWING_TRADER', archetype_code: 'SWING TRADER', archetype_name: 'Swing Traders', risk_severity: 0.25, avg_risk_score: 28, description: 'Multi-day holds, trend-following approach', members: [7006, 7011, 7013, 7015, 7018, 7020, 7022, 7035, 7036, 7037, 7038, 7039] },
  { cluster_id: 4, member_count: 9, label_hint: 'MANUAL_RETAIL', archetype_code: 'MANUAL RETAIL', archetype_name: 'Manual Retail', risk_severity: 0.15, avg_risk_score: 18, description: 'Discretionary trading, irregular patterns, low risk', members: [7007, 7012, 7014, 7017, 7019, 7021, 7040, 7041, 7042] },
  { cluster_id: -1, member_count: 3, label_hint: 'NOISE', archetype_code: 'UNKNOWN', archetype_name: 'Outliers / Noise', risk_severity: 0.50, avg_risk_score: 45, description: 'Traders not fitting established patterns - requires manual review', members: [7005, 7008, 7010] },
];

// ── Live API mode ──
const USE_MOCK_DATA = false;

// ============================================
// Types
// ============================================

interface TraderWithExplanation extends Trader {
  has_explanation?: boolean;
  strategies_count?: number;
}

interface ClusterProfile {
  cluster_id: number;
  member_count: number;
  status?: string;
  label_hint: string;
  archetype_code?: string;
  archetype_name?: string;
  risk_severity?: number;
  avg_risk_score?: number;
  description?: string;
  members?: number[];
}

type ViewMode = 'risk' | 'cluster';
type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

// ============================================
// Summary Badge Component (Compact inline badge)
// ============================================

interface SummaryBadgeProps {
  label: string;
  value: number;
  color: 'critical' | 'high' | 'medium' | 'low' | 'accent';
  onClick?: () => void;
  pulse?: boolean;
}

function SummaryBadge({ label, value, color, onClick, pulse }: SummaryBadgeProps) {
  const colorClasses = {
    critical: 'bg-risk-critical-bg border-risk-critical-border text-risk-critical',
    high: 'bg-risk-high-bg border-risk-high-border text-risk-high',
    medium: 'bg-risk-medium-bg border-risk-medium-border text-risk-medium',
    low: 'bg-risk-low-bg border-risk-low-border text-risk-low',
    accent: 'bg-accent-subtle border-border text-accent',
  };

  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium transition-all',
        colorClasses[color],
        pulse && value > 0 && 'animate-pulse-subtle',
        onClick && 'cursor-pointer hover:brightness-125'
      )}
    >
      <span className="text-text-secondary">{label}</span>
      <span className="font-mono font-bold">{value}</span>
    </button>
  );
}

// ============================================
// Risk Badge Component
// ============================================

function RiskBadge({ level, size = 'sm' }: { level: string; size?: 'sm' | 'lg' }) {
  const sizeClasses = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  
  return (
    <span className={clsx(
      'badge font-semibold rounded',
      sizeClasses,
      level === 'CRITICAL' && 'badge-critical',
      level === 'HIGH' && 'badge-high',
      level === 'MEDIUM' && 'badge-medium',
      level === 'LOW' && 'badge-low'
    )}>
      {level}
    </span>
  );
}

// ============================================
// Action Badge Component
// ============================================

function ActionBadge({ action }: { action: string }) {
  const actionStyles: Record<string, string> = {
    A_BOOK_FULL: 'bg-risk-critical-bg border-risk-critical-border text-risk-critical',
    A_BOOK_PARTIAL: 'bg-risk-high-bg border-risk-high-border text-risk-high',
    SPREAD_WIDEN: 'bg-risk-medium-bg border-risk-medium-border text-risk-medium',
    MONITOR: 'bg-info-bg border-info-border text-info',
    B_BOOK_STD: 'bg-risk-low-bg border-risk-low-border text-risk-low',
    B_BOOK_SAFE: 'bg-risk-low-bg border-risk-low-border text-risk-low',
    CLASSIFY_URGENT: 'bg-accent-subtle border-accent text-accent',
  };

  return (
    <span className={clsx(
      'px-2 py-0.5 text-xs font-medium rounded border',
      actionStyles[action] || 'bg-surface border-border text-text-secondary'
    )}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

// ============================================
// Confidence Bar Component
// ============================================

function ConfidenceBar({ value, color = 'accent' }: { value: number; color?: 'accent' | 'critical' | 'high' | 'medium' | 'low' }) {
  const percentage = Math.round(value * 100);
  
  const barColors = {
    accent: 'bg-accent',
    critical: 'bg-risk-critical',
    high: 'bg-risk-high',
    medium: 'bg-risk-medium',
    low: 'bg-risk-low',
  };
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
        <div 
          className={clsx('h-full rounded-full transition-all', barColors[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-mono text-text-secondary w-10 text-right">
        {percentage}%
      </span>
    </div>
  );
}

// ============================================
// Trader Row Component (Compact)
// ============================================

interface TraderRowProps {
  trader: TraderWithExplanation;
  selected: boolean;
  onClick: () => void;
}

function TraderRow({ trader, selected, onClick }: TraderRowProps) {
  const riskColor = 
    trader.risk_level === 'CRITICAL' ? 'text-risk-critical' :
    trader.risk_level === 'HIGH' ? 'text-risk-high' :
    trader.risk_level === 'MEDIUM' ? 'text-risk-medium' : 'text-risk-low';

  // Mock timestamp - in real app this would come from trader data
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-all',
        'hover:bg-surface-hover border-l-2',
        selected 
          ? 'bg-surface-active border-accent' 
          : 'border-transparent'
      )}
    >
      {/* Compact Avatar */}
      <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center border border-border flex-shrink-0">
        <span className="text-xs font-mono text-text-secondary">
          {String(trader.login).slice(-2)}
        </span>
      </div>

      {/* Name + Timestamp */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm font-medium text-text-primary truncate">
          {trader.name || `Trader ${trader.login}`}
        </span>
        <span className="text-[10px] text-text-muted font-mono flex-shrink-0">
          {timeStr} / {dateStr}
        </span>
      </div>

      {/* Classification + Strategies */}
      <div className="flex items-center gap-1.5 text-xs text-text-secondary flex-shrink-0">
        <span className="font-mono">{trader.classification}</span>
        {(trader.strategies_count ?? 0) > 1 && (
          <span className="text-accent">• {trader.strategies_count} strats</span>
        )}
      </div>

      {/* Risk Score (single number, color-coded) */}
      <span className={clsx('font-mono text-sm font-semibold w-8 text-right flex-shrink-0', riskColor)}>
        {trader.risk_score?.toFixed(0) || '—'}
      </span>

      {/* Action Badge */}
      <ActionBadge action={trader.recommended_action || 'MONITOR'} />
    </button>
  );
}

// ============================================
// Collapsible Risk Section
// ============================================

interface RiskSectionProps {
  level: RiskLevel;
  traders: TraderWithExplanation[];
  selectedTrader: number | null;
  onSelectTrader: (login: number) => void;
  defaultExpanded?: boolean;
}

function RiskSection({ level, traders, selectedTrader, onSelectTrader, defaultExpanded = false }: RiskSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  const levelConfig = {
    CRITICAL: {
      color: 'text-risk-critical',
      bg: 'bg-risk-critical-bg',
      border: 'border-risk-critical-border',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      subtitle: 'Auto-explained',
    },
    HIGH: {
      color: 'text-risk-high',
      bg: 'bg-risk-high-bg',
      border: 'border-risk-high-border',
      icon: <Activity className="w-3.5 h-3.5" />,
      subtitle: 'Auto-explained',
    },
    MEDIUM: {
      color: 'text-risk-medium',
      bg: 'bg-risk-medium-bg',
      border: 'border-risk-medium-border',
      icon: <Shield className="w-3.5 h-3.5" />,
      subtitle: 'On-demand',
    },
    LOW: {
      color: 'text-risk-low',
      bg: 'bg-risk-low-bg',
      border: 'border-risk-low-border',
      icon: <Shield className="w-3.5 h-3.5" />,
      subtitle: 'On-demand',
    },
  };

  const config = levelConfig[level];

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className={clsx(
          'w-full flex items-center justify-between px-3 py-2 transition-colors',
          'hover:bg-surface-hover'
        )}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          )}
          <span className={config.color}>{config.icon}</span>
          <span className={clsx('text-sm font-medium', config.color)}>
            {level}
          </span>
          <span className={clsx(
            'px-1.5 py-0.5 rounded text-xs font-mono',
            config.bg,
            config.border,
            'border'
          )}>
            {traders.length}
          </span>
        </div>
        <span className="text-xs text-text-muted">
          {config.subtitle}
        </span>
      </button>

      {expanded && traders.length > 0 && (
        <div className="border-t border-border-muted">
          {traders.map(trader => (
            <TraderRow
              key={trader.login}
              trader={trader}
              selected={selectedTrader === trader.login}
              onClick={() => onSelectTrader(trader.login)}
            />
          ))}
        </div>
      )}

      {expanded && traders.length === 0 && (
        <div className="px-3 py-4 text-center text-text-muted text-sm">
          No traders at this risk level
        </div>
      )}
    </div>
  );
}

// ============================================
// Cluster Card Component
// ============================================

interface ClusterCardProps {
  cluster: ClusterProfile;
  selected: boolean;
  onClick: () => void;
}

function ClusterCard({ cluster, selected, onClick }: ClusterCardProps) {
  const severity = cluster.risk_severity ?? 0.5;
  
  // Mock timestamp - in real app this would come from cluster data
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  
  const borderColor = 
    cluster.cluster_id === -1 ? 'border-accent' :
    severity >= 0.8 ? 'border-risk-critical' :
    severity >= 0.6 ? 'border-risk-high' :
    severity >= 0.4 ? 'border-risk-medium' :
    'border-risk-low';

  const bgColor =
    cluster.cluster_id === -1 ? 'bg-accent-subtle' :
    severity >= 0.8 ? 'bg-risk-critical-bg' :
    severity >= 0.6 ? 'bg-risk-high-bg' :
    severity >= 0.4 ? 'bg-risk-medium-bg' :
    'bg-risk-low-bg';

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full p-4 rounded border-l-4 transition-all text-left',
        borderColor,
        selected ? 'bg-surface-active ring-1 ring-accent' : bgColor,
        'hover:brightness-110'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-medium text-text-primary">
            {cluster.archetype_name || cluster.label_hint || 
             (cluster.cluster_id === -1 ? 'Noise / Outliers' : `Cluster ${cluster.cluster_id}`)}
          </h4>
          <span className="text-xs text-text-secondary font-mono">
            {cluster.archetype_code || 'UNKNOWN'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-text-secondary">
          <span className="text-[11px] font-mono text-text-muted">
            {timeStr} / {dateStr}
          </span>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span className="font-mono text-sm">{cluster.member_count}</span>
          </div>
        </div>
      </div>

      {cluster.description && (
        <p className="text-sm text-text-secondary mb-3 line-clamp-2">
          {cluster.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="text-text-muted">
            Avg Risk: <span className="font-mono text-text-primary">{cluster.avg_risk_score?.toFixed(0) || '—'}</span>
          </span>
          <span className="text-text-muted">
            Severity: <span className="font-mono text-text-primary">{severity.toFixed(2)}</span>
          </span>
        </div>
      </div>

      {cluster.members && cluster.members.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border-muted">
          <span className="text-xs text-text-muted">
            Members: {cluster.members.slice(0, 5).join(', ')}
            {cluster.members.length > 5 && ` +${cluster.members.length - 5} more`}
          </span>
        </div>
      )}
    </button>
  );
}

// ============================================
// Trader Detail Panel
// ============================================

interface TraderDetailPanelProps {
  login: number;
}

function TraderDetailPanel({ login }: TraderDetailPanelProps) {
  const queryClient = useQueryClient();
  
  // Copy state - must be before any conditional returns
  const [copied, setCopied] = useState(false);

  // ── Mock shortcuts (dev only) ──
  const mockExplanation = USE_MOCK_DATA ? MOCK_EXPLANATIONS[login] : null;
  const mockFeatures   = USE_MOCK_DATA ? MOCK_FEATURES[login] : null;
  const mockTrader     = USE_MOCK_DATA ? MOCK_TRADERS.find(t => t.login === login) : null;

  // ── Dashboard ──
  // GET /api/v1/traders/{login}/dashboard
  // Response is nested; we normalise it into a flat shape the panel expects.
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['trader-dashboard', login],
    queryFn: () => tradersApi.getDashboard(login),
    enabled: !USE_MOCK_DATA && !!login,
  });

  const normalizedTrader = dashboardData ? {
    login:              (dashboardData as any).trader?.login ?? login,
    name:               (dashboardData as any).trader?.name ?? `Trader ${login}`,
    group:              (dashboardData as any).trader?.group,
    risk_level:         (dashboardData as any).risk_assessment?.risk_level ?? 'LOW',
    risk_score:         (dashboardData as any).risk_assessment?.risk_score ?? 0,
    confidence:         (dashboardData as any).risk_assessment?.confidence ?? 0,
    classification:     (dashboardData as any).risk_assessment?.classification ?? 'UNKNOWN',
    recommended_action: (dashboardData as any).risk_assessment?.recommended_action ?? 'MONITOR',
    strategies_count:   (dashboardData as any).risk_assessment?.strategies_count,
  } : null;

  // ── Explanation ──
  // GET /api/v1/explanations/trader/{login}
  const { data: explanationData, isLoading: explanationLoading } = useQuery({
    queryKey: ['explanation', login],
    queryFn: () => explanationsApi.getTraderExplanation(login),
    enabled: !USE_MOCK_DATA && !!login,
  });

  // ── Features (Gap 2 resolved: field names now match) ──
  // GET /api/v1/traders/{login}/features?window=1d
  // Returns avg_hold_seconds, timing_regularity, lot_entropy as top-level fields.
  const { data: featuresData } = useQuery({
    queryKey: ['trader-features', login],
    queryFn: () => tradersApi.getFeatures(login, '1d'),
    enabled: !USE_MOCK_DATA && !!login,
  });

  // ── Features — response is flat (no 'features' wrapper key) ──
  // Nested fields: win_rate/profit_factor in profit_metrics, burst_score in execution
  const rawFeatures = USE_MOCK_DATA ? mockFeatures : featuresData as any;
  const features = rawFeatures ? {
    avg_hold_seconds:    rawFeatures.avg_hold_seconds ?? rawFeatures.mean_holding_time_sec ?? rawFeatures.holding_behavior?.mean_holding_time_sec,
    win_rate:            rawFeatures.win_rate ?? rawFeatures.profit_metrics?.win_rate,
    profit_factor:       rawFeatures.profit_factor ?? rawFeatures.profit_metrics?.profit_factor,
    timing_regularity:   rawFeatures.timing_regularity ?? rawFeatures.timing_regularity_score ?? rawFeatures.execution?.timing_regularity_score,
    lot_entropy:         rawFeatures.lot_entropy ?? rawFeatures.order_structure?.lot_size_entropy,
    burst_score:         rawFeatures.burst_score ?? rawFeatures.execution?.burst_score,
  } : null;
  // GET /api/v1/traders/{login}/strategies
  // Only needed when multiple strategies are detected.
  const strategiesCount = (USE_MOCK_DATA ? mockTrader : normalizedTrader)?.strategies_count ?? 0;
  const { data: strategiesData } = useQuery({
    queryKey: ['trader-strategies', login],
    // NOTE: add tradersApi.getStrategies(login) to your API service:
    //   getStrategies: (login) => api.get(`/api/v1/traders/${login}/strategies`)
    queryFn: () => (tradersApi as any).getStrategies(login),
    enabled: !USE_MOCK_DATA && !!login && strategiesCount > 1,
  });

  // ── Generate-explanation mutation (Gap 4 resolved: all risk levels) ──
  // POST /api/v1/explanations/trader/{login}/generate
  const generateMutation = useMutation({
    mutationFn: () => explanationsApi.generateExplanation(login),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['explanation', login] });
    },
  });

  // ── Resolved data sources ──
  const trader    = USE_MOCK_DATA ? mockTrader     : normalizedTrader;
  const explanation = USE_MOCK_DATA ? mockExplanation : explanationData;
  if (!USE_MOCK_DATA && dashboardLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!trader) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        No data available
      </div>
    );
  }

  const { current, claude_explanations, actions, behavior_change } = explanation || {};
  const hasExplanation = claude_explanations && claude_explanations.length > 0;
  const riskLevel = current?.risk_level || trader.risk_level || 'LOW';
  // Gap 4 resolved: generate endpoint works for all risk levels.
  // Show Explain button whenever no fresh Claude explanation exists.
  // Show Explain button when no explanation exists OR the existing one is stale
  // (stale = classification, risk level, or triggered_rules changed since last generation)
  const isStale = hasExplanation && claude_explanations[0].is_stale === true;
  const showExplainButton = !hasExplanation || isStale;

  // Format timestamp for Fresh/Stale badge
  const formatExplanationTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Copy explanation to clipboard
  const handleCopyExplanation = () => {
    const explanationText = hasExplanation ? claude_explanations[0].explanation : '';
    const header = `═══════════════════════════════════════
NEXRISK AI ANALYSIS
═══════════════════════════════════════
Trader: ${trader.name || `Trader #${login}`}
Login: #${login}
Risk Level: ${riskLevel}
Risk Score: ${(current?.risk_score || trader.risk_score || 0).toFixed(1)}
Classification: ${current?.classification || trader.classification || 'UNKNOWN'}
Action: ${current?.recommended_action || trader.recommended_action || 'MONITOR'}
───────────────────────────────────────
`;
    const rules = current?.triggered_rules ? `Triggered Rules:\n${current.triggered_rules}\n───────────────────────────────────────\n` : '';
    const analysis = explanationText ? `AI Analysis:\n${explanationText}\n` : 'No AI analysis available.\n';
    const footer = `───────────────────────────────────────
Generated: ${new Date().toLocaleString('en-GB')}
Model: CH-nexrisk-4.5
═══════════════════════════════════════`;
    
    const fullText = header + rules + analysis + footer;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Send to Telegram
  const handleSendTelegram = () => {
    const explanationText = hasExplanation ? claude_explanations[0].explanation : 'No AI analysis available.';
    const message = `NEXRISK ALERT\n\nTrader: ${trader.name || `Trader #${login}`}\nLogin: #${login}\nRisk: ${riskLevel} (${(current?.risk_score || trader.risk_score || 0).toFixed(0)})\nClass: ${current?.classification || trader.classification}\nAction: ${current?.recommended_action || trader.recommended_action}\n\n${explanationText.substring(0, 500)}${explanationText.length > 500 ? '...' : ''}`;
    const telegramUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(message)}`;
    window.open(telegramUrl, '_blank', 'width=550,height=450');
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Header - Compact */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-text-primary">
            {trader.name || `Trader #${login}`}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-secondary">#{login}</span>
            {/* Action buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopyExplanation}
                className="p-1 rounded hover:bg-surface-hover transition-colors group"
                title="Copy analysis to clipboard"
              >
                {copied ? (
                  <CheckIcon className="w-3.5 h-3.5 text-risk-low" />
                ) : (
                  <CopyIcon className="w-3.5 h-3.5 text-text-muted group-hover:text-text-primary" />
                )}
              </button>
              <button
                onClick={handleSendTelegram}
                className="p-1 rounded hover:bg-surface-hover transition-colors group"
                title="Share via Telegram"
              >
                <TelegramIcon className="w-3.5 h-3.5 text-text-muted group-hover:text-[#26A5E4]" />
              </button>
            </div>
          </div>
        </div>
        <RiskBadge level={riskLevel} size="lg" />
      </div>

      {/* Quick Stats Grid - Compact 2x2 */}
      <div className="px-3 py-2 border-b border-border">
        <h4 className="text-xs font-medium text-text-muted mb-2">Quick Stats</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#232225] px-2 py-1.5 rounded border border-border">
            <span className="text-[11px] text-text-muted flex items-center gap-1">
              <Target className="w-3 h-3" /> Risk Score
            </span>
            <p className="font-mono text-lg text-text-primary">
              {(current?.risk_score || trader.risk_score || 0).toFixed(1)}
            </p>
          </div>
          <div className="bg-[#232225] px-2 py-1.5 rounded border border-border">
            <span className="text-[11px] text-text-muted flex items-center gap-1">
              <Percent className="w-3 h-3" /> Confidence
            </span>
            <p className="font-mono text-lg text-text-primary">
              {((current?.confidence || trader.confidence || 0) * 100).toFixed(0)}%
            </p>
          </div>
          <div className="bg-[#232225] px-2 py-1.5 rounded border border-border">
            <span className="text-[11px] text-text-muted flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Classification
            </span>
            <p className="font-mono text-sm text-text-primary truncate">
              {current?.classification || trader.classification || 'UNKNOWN'}
            </p>
          </div>
          <div className="bg-[#232225] px-2 py-1.5 rounded border border-border">
            <span className="text-[11px] text-text-muted flex items-center gap-1">
              <Zap className="w-3 h-3" /> Action
            </span>
            <div className="mt-0.5">
              <ActionBadge action={current?.recommended_action || trader.recommended_action || 'MONITOR'} />
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Strategy Alert (Gap 3) */}
      {strategiesCount > 1 && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-start gap-2 px-2 py-1.5 rounded border bg-accent-subtle border-accent">
            <Zap className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <span className="font-medium text-accent">
                {strategiesData
                  ? `${(strategiesData as any).strategy_count} strategies detected`
                  : `${strategiesCount} strategies detected`}
              </span>
              {strategiesData && (
                <span className="text-text-muted ml-2">
                  • {((strategiesData as any).toxic_strategy_pct * 100).toFixed(0)}% toxic
                </span>
              )}
              {strategiesData && (strategiesData as any).strategies?.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {(strategiesData as any).strategies.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-text-secondary">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                      <span className="font-mono">{s.classification ?? s.name ?? s}</span>
                      {s.confidence != null && (
                        <span className="text-text-muted ml-auto">{(s.confidence * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Behavior Trend - Compact */}
      {behavior_change && (
        <div className="px-3 py-2 border-b border-border">
          <div className={clsx(
            'flex items-center gap-2 px-2 py-1.5 rounded border',
            behavior_change.trend === 'INCREASING_RISK' && 'bg-risk-critical-bg border-risk-critical-border',
            behavior_change.trend === 'DECREASING_RISK' && 'bg-risk-low-bg border-risk-low-border',
            behavior_change.trend === 'STABLE' && 'bg-[#232225] border-border'
          )}>
            <TrendingUp className={clsx(
              'w-3.5 h-3.5',
              behavior_change.trend === 'INCREASING_RISK' && 'text-risk-critical rotate-0',
              behavior_change.trend === 'DECREASING_RISK' && 'text-risk-low rotate-180',
              behavior_change.trend === 'STABLE' && 'text-text-muted'
            )} />
            <span className={clsx(
              'text-sm font-medium',
              behavior_change.trend === 'INCREASING_RISK' && 'text-risk-critical',
              behavior_change.trend === 'DECREASING_RISK' && 'text-risk-low',
              behavior_change.trend === 'STABLE' && 'text-text-primary'
            )}>
              {behavior_change.trend?.replace(/_/g, ' ') || 'NEW'}
            </span>
            {behavior_change.risk_delta && (
              <span className="text-xs text-text-muted ml-auto">
                {behavior_change.risk_delta > 0 ? '+' : ''}{behavior_change.risk_delta.toFixed(1)} pts
              </span>
            )}
          </div>
        </div>
      )}

      {/* Triggered Rules - Compact */}
      {current?.triggered_rules && (
        <div className="px-3 py-2 border-b border-border">
          <h4 className="text-xs font-medium text-text-muted mb-1.5">Triggered Rules</h4>
          <div className="bg-[#232225] px-2 py-1.5 rounded border border-border">
            <p className="text-xs text-text-primary whitespace-pre-line font-mono leading-relaxed">
              {current.triggered_rules}
            </p>
          </div>
        </div>
      )}

      {/* AI Explanation Section - More Vertical Space */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-text-muted flex items-center gap-1.5">
            <AIInsightsIcon className="w-3.5 h-3.5 text-accent" />
            AI Analysis
          </h4>
          {showExplainButton && (
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="btn btn-primary text-xs flex items-center gap-1 py-1 px-2"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Explaining...
                </>
              ) : (
                <>
                  <SparkIcon className="w-3 h-3" />
                  Explain
                </>
              )}
            </button>
          )}
        </div>

        {(!USE_MOCK_DATA && explanationLoading) ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          </div>
        ) : hasExplanation ? (
          <div className="bg-[#232225] rounded p-3 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <span className={clsx(
                'text-[11px] px-1.5 py-0.5 rounded border',
                claude_explanations[0].is_stale 
                  ? 'bg-risk-medium-bg text-risk-medium border-risk-medium-border' 
                  : 'bg-accent-subtle text-accent border-border'
              )}>
                {claude_explanations[0].is_stale ? 'Stale' : 'Fresh'} {formatExplanationTime(claude_explanations[0].generated_at)}
              </span>
              <span className="text-[11px] text-text-muted font-mono">
                CH-nexrisk-4.5
              </span>
            </div>
            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
              {claude_explanations[0].explanation}
            </p>
            {claude_explanations[0].is_stale && claude_explanations[0].stale_warning && (
              <p className="mt-2 text-xs text-risk-medium">
                ⚠ {claude_explanations[0].stale_warning}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-[#232225] rounded p-3 border border-border">
            <p className="text-sm text-text-muted">
              {current?.template_explanation || 'No AI analysis available. Click Explain for detailed insights.'}
            </p>
          </div>
        )}
      </div>

      {/* Fallback Metrics (Always Visible) - Compact */}
      <div className="px-3 py-2">
        <h4 className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          Behavioral Metrics
        </h4>
        <div className="grid grid-cols-3 gap-1.5">
          <MetricTile 
            label="Hold Time" 
            value={formatDuration(features?.avg_hold_seconds ?? features?.mean_holding_time_sec)}
            icon={<Clock className="w-2.5 h-2.5" />}
          />
          <MetricTile 
            label="Win Rate" 
            value={`${(((features?.win_rate) || 0) * 100).toFixed(0)}%`}
            icon={<Target className="w-2.5 h-2.5" />}
          />
          <MetricTile 
            label="Profit Factor" 
            value={(features?.profit_factor || 0).toFixed(2)}
            icon={<TrendingUp className="w-2.5 h-2.5" />}
          />
          <MetricTile 
            label="Timing Reg" 
            value={(features?.timing_regularity ?? features?.timing_regularity_score ?? 0).toFixed(2)}
            icon={<Activity className="w-2.5 h-2.5" />}
          />
          <MetricTile 
            label="Lot Entropy" 
            value={(features?.lot_entropy ?? 0).toFixed(2)}
            icon={<BarChart3 className="w-2.5 h-2.5" />}
          />
          <MetricTile 
            label="Burst Score" 
            value={(features?.burst_score ?? 0).toFixed(1)}
            icon={<Zap className="w-2.5 h-2.5" />}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Cluster Detail Panel
// ============================================

interface ClusterDetailPanelProps {
  cluster: ClusterProfile;
  /** Latest clustering run_id — used for the live explain endpoint */
  runId?: string | null;
  /** Full trader list from the parent — used for member name/score lookup */
  traders?: any[];
}

function ClusterDetailPanel({ cluster, runId, traders = [] }: ClusterDetailPanelProps) {
  const [explanation, setExplanation] = useState<{
    behavior_description: string;
    risk_indicators: string[];
    suggested_archetype_code: string;
    confidence: number;
    reasoning: string;
    generated_at: string;
  } | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [copied, setCopied] = useState(false);

  // Timestamps
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  // Wire to POST /api/v1/clustering/runs/{runId}/clusters/{n}/explain
  const handleExplain = async () => {
    if (!runId) return;
    setIsExplaining(true);
    try {
      const result = await clusteringApi.explainCluster(runId, cluster.cluster_id);
      // Normalise response — backend returns the explanation fields directly or
      // nested under an 'explanation' key depending on provider.
      const r = (result as any)?.explanation ?? result;
      setExplanation({
        behavior_description: r.behavior_description ?? r.summary ?? '',
        risk_indicators:      Array.isArray(r.risk_indicators) ? r.risk_indicators : [],
        suggested_archetype_code: r.suggested_archetype_code ?? cluster.archetype_code ?? 'UNKNOWN',
        confidence:           r.confidence ?? 0,
        reasoning:            r.reasoning ?? '',
        generated_at:         r.generated_at ?? new Date().toISOString(),
      });
    } catch (err) {
      console.error('Cluster explain failed:', err);
    } finally {
      setIsExplaining(false);
    }
  };

  // Copy cluster analysis to clipboard
  const handleCopyCluster = () => {
    const membersList = cluster.members?.map(m => {
      const t = traders.find((x: any) => x.login === m);
      return `  #${m}${t ? ` - ${t.name} (Risk: ${t.risk_score?.toFixed(0)})` : ''}`;
    }).join('\n') || 'No members';

    const header = `═══════════════════════════════════════
NEXRISK CLUSTER ANALYSIS
═══════════════════════════════════════
Cluster: ${cluster.archetype_name || `Cluster ${cluster.cluster_id}`}
Archetype: ${cluster.archetype_code || 'UNKNOWN'}
Members: ${cluster.member_count}
Avg Risk Score: ${cluster.avg_risk_score?.toFixed(0) || '—'}
Risk Severity: ${((cluster.risk_severity || 0) * 100).toFixed(0)}%
───────────────────────────────────────
`;
    const desc = cluster.description ? `Description:\n${cluster.description}\n───────────────────────────────────────\n` : '';
    const analysis = explanation ? `AI Analysis:\n${explanation.behavior_description}\n\nRisk Indicators:\n${explanation.risk_indicators.map(r => `• ${r}`).join('\n')}\n\nReasoning:\n${explanation.reasoning}\n───────────────────────────────────────\n` : '';
    const members = `Cluster Members:\n${membersList}\n`;
    const footer = `───────────────────────────────────────
Generated: ${new Date().toLocaleString('en-GB')}
Model: CH-nexrisk-4.5
═══════════════════════════════════════`;
    
    const fullText = header + desc + analysis + members + footer;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Send to Telegram
  const handleSendTelegram = () => {
    const analysisText = explanation ? explanation.behavior_description : cluster.description || 'No analysis available.';
    const message = `NEXRISK CLUSTER ALERT\n\nCluster: ${cluster.archetype_name || `Cluster ${cluster.cluster_id}`}\nArchetype: ${cluster.archetype_code || 'UNKNOWN'}\nMembers: ${cluster.member_count}\nAvg Risk: ${cluster.avg_risk_score?.toFixed(0) || '—'}\nSeverity: ${((cluster.risk_severity || 0) * 100).toFixed(0)}%\n\n${analysisText.substring(0, 400)}${analysisText.length > 400 ? '...' : ''}`;
    const telegramUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(message)}`;
    window.open(telegramUrl, '_blank', 'width=550,height=450');
  };

  const severity = cluster.risk_severity ?? 0.5;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header - Compact with copy/telegram */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-base font-medium text-text-primary">
              {cluster.archetype_name || (cluster.cluster_id === -1 ? 'Noise / Outliers' : `Cluster ${cluster.cluster_id}`)}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-text-secondary">
                {cluster.archetype_code || 'UNKNOWN'}
              </span>
              {/* Action buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopyCluster}
                  className="p-1 rounded hover:bg-surface-hover transition-colors group"
                  title="Copy analysis to clipboard"
                >
                  {copied ? (
                    <CheckIcon className="w-3.5 h-3.5 text-risk-low" />
                  ) : (
                    <CopyIcon className="w-3.5 h-3.5 text-text-muted group-hover:text-text-primary" />
                  )}
                </button>
                <button
                  onClick={handleSendTelegram}
                  className="p-1 rounded hover:bg-surface-hover transition-colors group"
                  title="Share via Telegram"
                >
                  <TelegramIcon className="w-3.5 h-3.5 text-text-muted group-hover:text-[#26A5E4]" />
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-text-muted">
              {timeStr} / {dateStr}
            </span>
            <div className="flex items-center gap-1.5 text-accent">
              <Users className="w-4 h-4" />
              <span className="font-mono text-lg">{cluster.member_count}</span>
            </div>
          </div>
        </div>
        {cluster.description && (
          <p className="text-xs text-text-secondary mt-1">{cluster.description}</p>
        )}
      </div>

      {/* Cluster Stats - Compact */}
      <div className="px-3 py-2 border-b border-border">
        <h4 className="text-xs font-medium text-text-muted mb-2">Cluster Metrics</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#232225] px-2 py-1.5 rounded border border-border">
            <span className="text-[11px] text-text-muted">Avg Risk Score</span>
            <p className="font-mono text-lg text-text-primary">{cluster.avg_risk_score?.toFixed(0) || '—'}</p>
          </div>
          <div className="bg-[#232225] px-2 py-1.5 rounded border border-border">
            <span className="text-[11px] text-text-muted">Risk Severity</span>
            <p className={clsx(
              'font-mono text-lg',
              severity >= 0.8 ? 'text-risk-critical' :
              severity >= 0.6 ? 'text-risk-high' :
              severity >= 0.4 ? 'text-risk-medium' :
              'text-risk-low'
            )}>
              {(severity * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Explain Button */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={handleExplain}
          disabled={isExplaining}
          className="btn btn-primary w-full flex items-center justify-center gap-2 py-1.5"
        >
          {isExplaining ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analyzing cluster...
            </>
          ) : (
            'Explain This Cluster'
          )}
        </button>

        {explanation && (
          <div className="mt-3 bg-[#232225] rounded p-3 border border-border">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                <AIInsightsIcon className="w-3.5 h-3.5 text-accent" />
                AI Analysis
              </h5>
              <span className="text-[11px] font-mono text-text-muted">
                {new Date(explanation.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} CH-nexrisk-4.5
              </span>
            </div>
            <p className="text-xs text-text-secondary mb-2">
              {explanation.behavior_description}
            </p>
            
            <div className="mb-2">
              <h6 className="text-[11px] font-medium text-text-muted mb-1">Risk Indicators</h6>
              <ul className="space-y-0.5">
                {explanation.risk_indicators.map((indicator, i) => (
                  <li key={i} className="text-[11px] text-text-secondary flex items-start gap-1.5">
                    <span className="text-risk-medium mt-0.5">•</span>
                    {indicator}
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-[11px] text-text-muted mb-2 italic">
              "{explanation.reasoning}"
            </div>

            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border-muted">
              <span className="text-text-muted">
                Suggested: <span className="font-mono text-accent">
                  {explanation.suggested_archetype_code}
                </span>
              </span>
              <span className="text-text-muted">
                Confidence: <span className="font-mono text-text-primary">
                  {(explanation.confidence * 100).toFixed(0)}%
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Members List - Direct in panel, no nested scroll */}
      <div className="px-3 py-2">
        <h4 className="text-xs font-medium text-text-muted mb-2">Cluster Members</h4>
        <div className="space-y-1">
          {cluster.members?.map((login) => {
            const t = traders.find((x: any) => x.login === login);
            return (
              <div 
                key={login}
                className="flex items-center justify-between px-2 py-1 bg-[#232225] rounded border border-border"
              >
                <div>
                  <span className="font-mono text-xs text-text-primary">#{login}</span>
                  {t && (
                    <span className="text-[11px] text-text-muted ml-2">{t.name}</span>
                  )}
                </div>
                {t && (
                  <span className="text-[11px] font-mono text-text-secondary">
                    {t.risk_score?.toFixed(0)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Metric Tile Component
// ============================================

function MetricTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[#232225] px-2 py-1 rounded border border-border">
      <span className="text-[10px] text-text-muted flex items-center gap-1">
        {icon} {label}
      </span>
      <p className="font-mono text-xs text-text-primary">{value}</p>
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function formatDuration(seconds: number | undefined): string {
  if (!seconds || isNaN(seconds)) return '—';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

// ============================================
// Main Focus Page Component
// ============================================

export function FocusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('risk');
  
  // Selection state
  const { selectedTrader, setSelectedTrader } = useSelectionStore();
  const [selectedCluster, setSelectedCluster] = useState<ClusterProfile | null>(null);

  // Check for trader param in URL
  useEffect(() => {
    const traderParam = searchParams.get('trader');
    if (traderParam) {
      setSelectedTrader(Number(traderParam));
      setViewMode('risk');
    }
  }, [searchParams, setSelectedTrader]);

  // ── Traders ──
  // GET /api/v1/traders?limit=500
  // Gap 1 resolved: response now includes risk_level, confidence,
  // recommended_action, has_explanation, strategies_count on every row.
  const { data: apiTradersData, isLoading: tradersLoading, refetch: refetchTraders } = useQuery({
    queryKey: ['traders'],
    queryFn: () => tradersApi.getAll({ limit: 500 }),
    enabled: !USE_MOCK_DATA,
    refetchInterval: 60000,
  });

  const traders = USE_MOCK_DATA ? (MOCK_TRADERS as any[]) : ((apiTradersData as any)?.traders ?? []);

  // ── Clustering (Gap 1 side-car) ──
  // Step 1: get latest run_id
  const { data: runsData } = useQuery({
    queryKey: ['clustering-runs'],
    queryFn: () => clusteringApi.getRuns(1),
    enabled: !USE_MOCK_DATA,
    refetchInterval: 300000, // 5 min — runs don't change often
    staleTime: 60000,
  });
  const latestRunId: string | null = (runsData as any)?.runs?.[0]?.run_id ?? null;

  // Step 2: cluster profiles for the run
  const { data: profilesData } = useQuery({
    queryKey: ['clustering-profiles', latestRunId],
    queryFn: () => clusteringApi.getRunProfiles(latestRunId!),
    enabled: !USE_MOCK_DATA && !!latestRunId,
    staleTime: 60000,
  });

  // Step 3: run detail includes assignments[], used to build members lists
  // NOTE: add clusteringApi.getRun(runId) to your service if not present:
  //   getRun: (runId) => api.get(`/api/v1/clustering/runs/${runId}`)
  const { data: runDetailData } = useQuery({
    queryKey: ['clustering-run-detail', latestRunId],
    queryFn: () => (clusteringApi as any).getRun(latestRunId!),
    enabled: !USE_MOCK_DATA && !!latestRunId,
    staleTime: 60000,
  });

  // Merge profiles + assignments into enriched ClusterProfile[]
  const rawProfiles: any[] = (profilesData as any)?.profiles ?? [];
  const assignments: any[] = (runDetailData as any)?.assignments ?? [];

  const liveClusterProfiles: ClusterProfile[] = rawProfiles.map(p => ({
    cluster_id:     p.cluster_id,
    member_count:   p.member_count,
    status:         p.status,
    label_hint:     p.label_hint,
    archetype_code: p.mapped_archetype?.archetype_code ?? p.label_hint,
    archetype_name: p.mapped_archetype?.display_name  ?? p.label_hint,
    risk_severity:  p.risk_severity,
    avg_risk_score: p.avg_risk_score,
    description:    p.description,
    members: assignments
      .filter(a => a.cluster_id === p.cluster_id)
      .map(a => a.trader_login),
  }));

  const clusterProfiles = USE_MOCK_DATA ? MOCK_CLUSTERS : liveClusterProfiles;

  // Group traders by risk level — exclude unclassified (UNKNOWN) accounts
  // that exist in MT5 but haven't been classified by the risk engine yet.
  const tradersByRisk = useMemo(() => {
    const list = (traders || []).filter(
      (t: Trader) => t.classification && t.classification !== 'UNKNOWN'
    );
    return {
      CRITICAL: list.filter((t: Trader) => t.risk_level === 'CRITICAL'),
      HIGH:     list.filter((t: Trader) => t.risk_level === 'HIGH'),
      MEDIUM:   list.filter((t: Trader) => t.risk_level === 'MEDIUM'),
      LOW:      list.filter((t: Trader) => t.risk_level === 'LOW'),
    };
  }, [traders]);

  // Summary counts
  const counts = {
    critical: tradersByRisk.CRITICAL.length,
    high: tradersByRisk.HIGH.length,
    medium: tradersByRisk.MEDIUM.length,
    low: tradersByRisk.LOW.length,
    clusters: clusterProfiles.length,
  };

  // Handle trader selection
  const handleSelectTrader = useCallback((login: number) => {
    setSelectedTrader(login);
    setSelectedCluster(null);
    setSearchParams({ trader: String(login) });
  }, [setSelectedTrader, setSearchParams]);

  // Handle cluster selection
  const handleSelectCluster = useCallback((cluster: ClusterProfile) => {
    setSelectedCluster(cluster);
    setSelectedTrader(null);
  }, [setSelectedTrader]);

  return (
    <div className="h-full flex">
      {/* Left Side - Header + List */}
      <div className={clsx(
        'flex flex-col min-h-0',
        (selectedTrader || selectedCluster) ? 'flex-1' : 'flex-1'
      )}>
        {/* Unified Header Bar with Title + Summary Badges + View Toggle */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
          {/* Left: Title */}
          <div className="flex-shrink-0">
            <h1 className="text-base font-medium text-text-primary">Risk Intelligence Center</h1>
          </div>
          
          {/* Center: Summary Badges */}
          <div className="flex items-center gap-1.5 mx-4">
            <SummaryBadge
              label="Critical"
              value={counts.critical}
              color="critical"
              onClick={() => setViewMode('risk')}
              pulse={counts.critical > 0}
            />
            <SummaryBadge
              label="High"
              value={counts.high}
              color="high"
              onClick={() => setViewMode('risk')}
            />
            <SummaryBadge
              label="Medium"
              value={counts.medium}
              color="medium"
              onClick={() => setViewMode('risk')}
            />
            <SummaryBadge
              label="Low"
              value={counts.low}
              color="low"
              onClick={() => setViewMode('risk')}
            />
            <SummaryBadge
              label="Clusters"
              value={counts.clusters}
              color="accent"
              onClick={() => setViewMode('cluster')}
            />
          </div>
          
          {/* Right: View Toggle + Refresh */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => USE_MOCK_DATA ? null : refetchTraders()}
              className="btn btn-ghost p-1.5"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="flex bg-surface rounded border border-border">
              <button
                onClick={() => setViewMode('risk')}
                className={clsx(
                  'px-3 py-1 text-xs font-medium transition-colors rounded-l',
                  viewMode === 'risk' 
                    ? 'bg-accent text-white' 
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                Risk
              </button>
              <button
                onClick={() => setViewMode('cluster')}
                className={clsx(
                  'px-3 py-1 text-xs font-medium transition-colors rounded-r',
                  viewMode === 'cluster' 
                    ? 'bg-accent text-white' 
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                Cluster
              </button>
            </div>
          </div>
        </div>

        {/* Main List - scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!USE_MOCK_DATA && tradersLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : viewMode === 'risk' ? (
            <>
              <RiskSection
                level="CRITICAL"
                traders={tradersByRisk.CRITICAL}
                selectedTrader={selectedTrader}
                onSelectTrader={handleSelectTrader}
                defaultExpanded={true}
              />
              <RiskSection
                level="HIGH"
                traders={tradersByRisk.HIGH}
                selectedTrader={selectedTrader}
                onSelectTrader={handleSelectTrader}
                defaultExpanded={true}
              />
              <RiskSection
                level="MEDIUM"
                traders={tradersByRisk.MEDIUM}
                selectedTrader={selectedTrader}
                onSelectTrader={handleSelectTrader}
              />
              <RiskSection
                level="LOW"
                traders={tradersByRisk.LOW}
                selectedTrader={selectedTrader}
                onSelectTrader={handleSelectTrader}
              />
            </>
          ) : (
            <div className="p-4 space-y-3">
              {clusterProfiles.length > 0 ? (
                clusterProfiles.map(cluster => (
                  <ClusterCard
                    key={cluster.cluster_id}
                    cluster={cluster}
                    selected={selectedCluster?.cluster_id === cluster.cluster_id}
                    onClick={() => handleSelectCluster(cluster)}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-text-muted">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No clustering data available</p>
                  <p className="text-sm mt-1">Run a clustering analysis to see results</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel - Full Height */}
      {(selectedTrader || selectedCluster) && (
        <div className="w-[600px] h-full bg-[#313032] flex-shrink-0 border-l border-border">
          {selectedTrader ? (
            <TraderDetailPanel login={selectedTrader} />
          ) : selectedCluster ? (
            <ClusterDetailPanel
              cluster={selectedCluster}
              runId={USE_MOCK_DATA ? null : latestRunId}
              traders={traders}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export default FocusPage;
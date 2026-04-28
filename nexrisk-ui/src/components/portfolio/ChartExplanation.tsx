// ============================================
// ChartExplanation
//
// AI Insight side panel rendered INSIDE ChartPanel when the user has
// toggled "Get Insight" on in the chart header.
//
// Generation flow (per Ross's spec):
//   • User must invoke "Get Insight" — that's what mounts this
//     component. So mount === user explicitly asked.
//   • Therefore: kick off generation automatically on first mount of
//     this component (one-shot useEffect with empty deps).
//   • If the user toggles Get Insight off and back on for the same
//     chart/period/node, the existing useChartExplanation reset effect
//     (which clears explanation when chartId/period/mt5NodeId changes)
//     does NOT fire (those identifiers haven't changed) — so the cached
//     explanation reappears immediately on remount, no re-fetch.
//   • Regenerate button forces a fresh call.
//
// States: pre-fire / loading / loaded / error.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

import { useChartExplanation } from '@/hooks/useChartExplanation';
import {
  PERIOD_LABEL,
  type ChartEntry,
  type ChartPeriod,
} from './charts/registry';

// ── Local icons ──────────────────────────────────────────────────
const SparkIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} width="14" height="14">
    <path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3-3-7z" />
  </svg>
);

const CopyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} width="14" height="14">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} width="14" height="14">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface Props {
  entry:     ChartEntry;
  period:    ChartPeriod;
  mt5NodeId: number | null;
  /** Snapshot of the chart's data — passed to the backend prompt. */
  dataSnapshot?: unknown;
}

export function ChartExplanation({ entry, period, mt5NodeId, dataSnapshot }: Props) {
  const [copied, setCopied] = useState(false);

  const { explanation, isExplaining, error, generate } = useChartExplanation({
    chartId:      entry.id,
    chartLabel:   entry.label,
    period,
    mt5NodeId,
    dataSnapshot,
  });

  // Auto-fire on first mount of this component. ChartPanel only mounts
  // ChartExplanation when the user clicks "Get Insight" — so this
  // single-fire-on-mount IS the user's invocation.
  // useRef guard prevents re-fire if React StrictMode double-invokes
  // the effect in dev.
  const didKickRef = useRef(false);
  useEffect(() => {
    if (didKickRef.current) return;
    if (explanation || isExplaining || error) return; // already in some state
    didKickRef.current = true;
    generate();
    // Empty deps — fire once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    if (!explanation) return;
    try {
      await navigator.clipboard.writeText(explanation.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard API unavailable */ }
  };

  const generatedAtLabel = explanation
    ? new Date(explanation.generated_at).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '';

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      style={{ backgroundColor: '#1e1e20' }}
    >
      {/* Title strip */}
      <div
        className="px-3 py-2 border-b border-[#3a3a3c] flex items-center justify-between flex-shrink-0"
        style={{ backgroundColor: '#252527' }}
      >
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white">
          <SparkIcon className="text-[#c9b87c]" />
          <span>AI Insight</span>
        </div>
        {explanation && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#808080]">
            <span>{generatedAtLabel}</span>
            <span className="text-[#5a5a5e]">·</span>
            <span>{explanation.model}</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">

        {/* Pre-fire — brief flash before the auto-kick fires */}
        {!explanation && !isExplaining && !error && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <div className="text-xs text-[#808080] max-w-md">
              Preparing analysis of <span className="text-white">{entry.label}</span> for {PERIOD_LABEL[period]}…
            </div>
          </div>
        )}

        {/* Loading */}
        {isExplaining && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#c9b87c' }} />
            <div className="text-xs text-[#808080]">Generating analysis…</div>
          </div>
        )}

        {/* Error */}
        {error && !isExplaining && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="text-xs text-[#d07070] max-w-md text-center">{error}</div>
            <button
              onClick={generate}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs border border-[#555] text-white hover:border-[#c9b87c] transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        {/* Loaded */}
        {explanation && !isExplaining && (
          <div className="space-y-3">
            <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#d2d6e2' }}>
              {explanation.text}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-[#3a3a3c]">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border border-[#555] text-white hover:border-[#c9b87c] transition-colors"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={generate}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border border-[#555] text-white hover:border-[#c9b87c] transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
              {explanation.latency_ms != null && (
                <span className="text-[10px] font-mono text-[#606060] ml-auto">
                  {explanation.latency_ms} ms
                </span>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
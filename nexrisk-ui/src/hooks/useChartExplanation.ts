// ============================================
// useChartExplanation
//
// Mirrors the on-demand cluster-explanation pattern from Focus.tsx:
// component-local state, POST returns the explanation inline, no
// persistent caching across chart switches (cheaper to regenerate
// than to maintain a stale cache here).
//
// While the C++ chart-explain endpoint is in flight, this hook
// returns a canned response after a 1.5 s delay so the UI is fully
// testable. When the real endpoint lands, swap STUB_MODE to false
// and the body will hit explanationsApi.generateChartExplanation
// (already declared in @/services/api).
//
// Reset semantics: when chartId / period / mt5NodeId / dataSnapshot
// changes, the existing explanation is cleared. Stale explanations
// describing a different chart state are confusing.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';

import type { ChartId, ChartPeriod } from '@/components/portfolio/charts/registry';
// Real API call — currently stubbed. Uncomment when backend is live.
// import { explanationsApi } from '@/services/api';

// Toggle to false when /api/v1/explanations/chart/generate exists.
const STUB_MODE = true;

export interface ChartExplanation {
  text:         string;
  model:        string;
  generated_at: string;
  /** Latency in ms reported by backend (when available). */
  latency_ms?:  number;
}

export interface UseChartExplanationArgs {
  chartId:       ChartId;
  chartLabel:    string;
  period:        ChartPeriod;
  mt5NodeId:     number | null;
  /** Plain-JSON snapshot of the chart's data — backend uses to formulate the prompt. */
  dataSnapshot?: unknown;
}

export function useChartExplanation(args: UseChartExplanationArgs) {
  const [explanation, setExplanation] = useState<ChartExplanation | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the request signature so we can drop the response if the user
  // changed chart / period before it returned.
  const requestSigRef = useRef<string>('');

  // ── Reset on chart / period / node change ────────────────────
  // Per spec: generation is MANUAL — user must click "Get Insight" /
  // "Explain". The reset clears stale explanations when the user
  // switches chart so the AI panel doesn't show analysis of the
  // previously-selected chart, but no auto-generation happens.
  useEffect(() => {
    setExplanation(null);
    setError(null);
    setIsExplaining(false);
  }, [args.chartId, args.period, args.mt5NodeId]);

  // ── Generate ────────────────────────────────────────────────
  const generate = useCallback(async () => {
    const sig = `${args.chartId}|${args.period}|${args.mt5NodeId ?? '_'}`;
    requestSigRef.current = sig;
    setIsExplaining(true);
    setError(null);

    try {
      let result: ChartExplanation;

      if (STUB_MODE) {
        await new Promise(r => setTimeout(r, 1500));
        result = stubExplanation(args.chartLabel, args.period);
      } else {
        // Real backend path — wire when endpoint lands.
        // const r = await explanationsApi.generateChartExplanation({
        //   chart_id:      args.chartId,
        //   period:        args.period,
        //   mt5_node_id:   args.mt5NodeId,
        //   data_snapshot: args.dataSnapshot,
        // });
        // result = {
        //   text:         r.explanation,
        //   model:        r.model ?? 'unknown',
        //   generated_at: new Date().toISOString(),
        //   latency_ms:   r.latency_ms,
        // };
        throw new Error('Real backend call not wired yet — STUB_MODE is true.');
      }

      // Drop late responses if the user moved on.
      if (requestSigRef.current !== sig) return;
      setExplanation(result);
    } catch (e) {
      if (requestSigRef.current !== sig) return;
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      if (requestSigRef.current === sig) setIsExplaining(false);
    }
  }, [args.chartId, args.chartLabel, args.period, args.mt5NodeId, args.dataSnapshot]);

  return { explanation, isExplaining, error, generate };
}

// ── Stub response — readable enough that the UI looks "right" ──
function stubExplanation(chartLabel: string, period: string): ChartExplanation {
  return {
    text:
`This is a placeholder analysis of "${chartLabel}" for the selected period (${period}).

When the chart-explanation backend endpoint is connected, this panel will render Claude's plain-language interpretation tailored to the broker's portfolio managers and risk officers — covering observed patterns, the books and strategies most likely driving them, and recommended next actions.

For now, the surrounding UI (loading state, copy / regenerate controls, model + timestamp metadata) is fully functional against this stub.`,
    model:        'stub-claude-haiku-4.5',
    generated_at: new Date().toISOString(),
    latency_ms:   1500,
  };
}
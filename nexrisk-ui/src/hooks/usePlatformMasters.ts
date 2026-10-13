// ============================================
// usePlatformMasters
//
// Live connection state of the two MASTER nodes, MT5 and cTrader, as the
// B-Book page follows them: system.health says whether the MT5 master is
// connected (the same source as the bottom bar), and topic
// ctrader.node_status carries the cTrader master's state. One socket,
// nothing polled; the cTrader master is read once on mount and again when
// the socket reopens (events sent while it was down are lost).
// ============================================

import { useEffect, useRef, useState } from 'react';

import {
  ctraderApi,
  connectSystemHealthWebSocket,
  type CTraderNodeWsEvent,
} from '@/services/api';

export interface CTraderMasterState { id: number; name: string; status: string }

export interface PlatformMasters {
  /** null: not known yet. */
  mt5Up:    boolean | null;
  /** undefined: not known yet · null: no cTrader MASTER. */
  ctMaster: CTraderMasterState | null | undefined;
  mt5Active: boolean;
  ctActive:  boolean;
}

export function usePlatformMasters(): PlatformMasters {
  const [mt5Up, setMt5Up] = useState<boolean | null>(null);
  const [ctMaster, setCtMaster] = useState<CTraderMasterState | null | undefined>(undefined);
  const ctMasterRef = useRef(ctMaster);
  ctMasterRef.current = ctMaster;

  useEffect(() => {
    let cancelled = false;
    let events = 0;
    let openedBefore = false;

    const seedCTraderMaster = () => {
      const at = events;
      ctraderApi.getMaster()
        .then((res) => {
          if (cancelled || events !== at) return;      // an event overtook the read
          const m = res.master;
          setCtMaster(m ? { id: m.node_id, name: m.node_name, status: m.connection_status } : null);
        })
        .catch(() => { if (!cancelled) setCtMaster(prev => (prev === undefined ? null : prev)); });
    };

    const onCTraderEvent = (e: CTraderNodeWsEvent) => {
      events += 1;
      if (e.kind === 'snapshot') {
        const m = e.nodes.find(n => n.is_master || n.node_type === 'MASTER');
        setCtMaster(m ? { id: m.node_id, name: m.node_name, status: m.connection_status } : null);
        return;
      }
      if (e.kind === 'type_change') {
        if (e.promoted.new_type === 'MASTER') {
          setCtMaster({ id: e.promoted.node_id, name: e.promoted.node_name, status: 'CONNECTING' });
        }
        return;
      }
      const node = e.node;
      const current = ctMasterRef.current;
      if (node) {
        if (node.node_type !== 'MASTER' && !node.is_master) return;
        if (current && current.id === node.node_id && current.name === node.node_name && current.status === node.connection_status) return;
        setCtMaster({ id: node.node_id, name: node.node_name, status: node.connection_status });
      } else if (e.kind === 'status' && current && current.id === e.nodeId && current.status !== e.status) {
        setCtMaster({ ...current, status: e.status });
      }
    };

    seedCTraderMaster();
    const stop = connectSystemHealthWebSocket(
      (p) => {
        const up = !!p.master?.connected;
        setMt5Up(prev => (prev === up ? prev : up));
      },
      (status) => {
        if (status !== 'open') return;
        if (openedBefore) seedCTraderMaster();
        openedBefore = true;
      },
      onCTraderEvent,
    );
    return () => { cancelled = true; stop(); };
  }, []);

  return {
    mt5Up,
    ctMaster,
    mt5Active: mt5Up === true,
    ctActive:  !!ctMaster && ctMaster.status === 'CONNECTED',
  };
}

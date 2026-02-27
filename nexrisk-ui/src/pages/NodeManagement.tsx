// ============================================
// MT5 Servers — Node & Book Management
// Node types: MASTER · STANDBY · BACKUP · CLIENT · PARTNER
// ============================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { mt5Api, type MT5NodeAPI } from '@/services/api';
import { clsx } from 'clsx';

// ============================================================
// ICONS — SVG only, no emojis
// ============================================================
const IcoServer = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="M19,0H5C2.243,0,0,2.243,0,5v4c0,1.862,1.025,3.485,2.527,4.35C1.025,14.215,0,15.838,0,17.7v1.3c0,2.757,2.243,5,5,5h14c2.757,0,5-2.243,5-5v-1.3c0-1.862-1.025-3.485-2.527-4.35C22.975,12.485,24,10.862,24,9V5c0-2.757-2.243-5-5-5Zm3,19c0,1.654-1.346,3-3,3H5c-1.654,0-3-1.346-3-3v-1.3c0-1.654,1.346-3,3-3h14c1.654,0,3,1.346,3,3V19Zm0-10c0,1.654-1.346,3-3,3H5c-1.654,0-3-1.346-3-3V5c0-1.654,1.346-3,3-3h14c1.654,0,3,1.346,3,3v4ZM8,6H6c-.552,0-1,.448-1,1s.448,1,1,1h2c.552,0,1-.448,1-1s-.448-1-1-1Zm0,11H6c-.552,0-1,.448-1,1s.448,1,1,1h2c.552,0,1-.448,1-1s-.448-1-1-1Zm10,0h-8c-.552,0-1,.448-1,1s.448,1,1,1h8c.552,0,1-.448,1-1s-.448-1-1-1Zm0-11h-8c-.552,0-1,.448-1,1s.448,1,1,1h8c.552,0,1-.448,1-1s-.448-1-1-1Z"/>
  </svg>
);
const IcoBook = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="m22,0H6C3.794,0,2,1.794,2,4v16c0,2.206,1.794,4,4,4h16c1.103,0,2-.897,2-2V2c0-1.103-.897-2-2-2ZM6,22c-1.103,0-2-.897-2-2s.897-2,2-2h14v4H6Zm16,0h-.675c.114-.313.175-.65.175-1v-1H6c-.71,0-1.37.195-1.938.525C4.021,21.353,4,21.176,4,21V4c0-1.103.897-2,2-2h16v20Z"/>
  </svg>
);
const IcoPlus = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M19,11h-6V5c0-.553-.448-1-1-1s-1,.447-1,1v6H5c-.552,0-1,.447-1,1s.448,1,1,1h6v6c0,.553.448,1,1,1s1-.447,1-1v-6h6c.552,0,1-.447,1-1s-.448-1-1-1Z"/>
  </svg>
);
const IcoEdit = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M22.987,4.206l-3.193-3.193c-.663-.663-1.542-1.013-2.475-1.013s-1.812.35-2.475,1.013L1.707,14.146c-.286.286-.498.637-.616,1.022L.038,20.617c-.09.305-.004.633.224.855.169.163.393.251.624.251.077,0,.155-.01.231-.029l5.449-1.053c.385-.118.735-.33,1.021-.616l13.131-13.131c.663-.663,1.013-1.542,1.013-2.475s-.35-1.812-1.013-2.475Zm-7.397,1.51l1.697,1.697-10.004,10.004-1.697-1.697L15.59,5.716ZM2.281,21.719l.817-3.506,2.689,2.689-3.506.817Zm5.43-1.513l-1.917-1.917L15.798,8.285l1.917,1.917L7.711,20.206Zm12.983-12.983l-.552.552-1.917-1.917.552-.552c.33-.33.769-.512,1.237-.512s.906.182,1.237.512.512.769.512,1.237-.182.906-.512,1.237Z"/>
  </svg>
);
const IcoTrash = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M21,4h-3.1c-.4-2.3-2.4-4-4.9-4h-2c-2.5,0-4.5,1.7-4.9,4H3C2.4,4,2,4.4,2,5s.4,1,1,1h1v14c0,2.2,1.8,4,4,4h8c2.2,0,4-1.8,4-4V6h1c.6,0,1-.4,1-1S21.6,4,21,4Zm-10,16c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm4,0c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm1-14H8.2c.4-1.2,1.5-2,2.8-2h2c1.3,0,2.4.8,2.8,2H16Z"/>
  </svg>
);
const IcoWarning = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="m23.119,20.998l-9.49-19.071c-.573-1.151-1.686-1.927-2.629-1.927s-2.056.776-2.629,1.927L-.001,20.998c-.543,1.09-.521,2.327.058,3.399.579,1.072,1.598,1.656,2.571,1.603l18.862-.002c.973.053,1.992-.531,2.571-1.603.579-1.072.601-2.309.058-3.397Zm-11.119.002c-.828,0-1.5-.671-1.5-1.5s.672-1.5,1.5-1.5,1.5.671,1.5,1.5-.672,1.5-1.5,1.5Zm1-5c0,.553-.447,1-1,1s-1-.447-1-1v-8c0-.553.447-1,1-1s1,.447,1,1v8Z"/>
  </svg>
);
const IcoX = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="m13.414,12l5.293-5.293c.391-.391.391-1.023,0-1.414s-1.023-.391-1.414,0l-5.293,5.293-5.293-5.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l5.293,5.293-5.293,5.293c-.391.391-.391,1.023,0,1.414.195.195.451.293.707.293s.512-.098.707-.293l5.293-5.293,5.293,5.293c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414l-5.293-5.293Z"/>
  </svg>
);
const IcoChevronDown = ({ size = 11 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="m11.998,17c-.268,0-.518-.105-.707-.293l-8.292-8.293c-.391-.391-.391-1.023,0-1.414s1.023-.391,1.414,0l7.585,7.586,7.585-7.585c.391-.391,1.024-.391,1.414,0s.391,1.023,0,1.414l-8.292,8.292c-.188,.188-.439,.293-.707,.293Z"/>
  </svg>
);
const IcoEye = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <path d="m23.271,9.419c-1.02-2.264-2.469-4.216-4.277-5.796-1.85-1.614-4.052-2.831-6.549-3.616-.816-.254-1.717-.254-2.528,0-2.5.785-4.703,2.003-6.553,3.617C1.556,5.204.107,7.155-.913,9.419c-.463,1.026-.463,2.136,0,3.162,1.02,2.265,2.468,4.216,4.276,5.796,1.849,1.614,4.052,2.83,6.552,3.616.408.128.826.192,1.264.192s.856-.064,1.264-.192c2.5-.785,4.703-2.002,6.552-3.616,1.808-1.58,3.257-3.531,4.277-5.797.462-1.025.462-2.135-.001-3.161Zm-11.271,5.581c-2.757,0-5-2.243-5-5s2.243-5,5-5,5,2.243,5,5-2.243,5-5,5Zm0-8c-1.654,0-3,1.346-3,3s1.346,3,3,3,3-1.346,3-3-1.346-3-3-3Z"/>
  </svg>
);
const IcoEyeOff = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <path d="m4.707,3.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l.967.967C2.526,7.364.897,9.565,0,12c1.02,2.265,2.469,4.216,4.277,5.796,1.849,1.614,4.052,2.831,6.552,3.616.408.128.826.192,1.264.192s.856-.064,1.264-.192c1.338-.42,2.594-.991,3.744-1.698l2.192,2.192c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414L4.707,3.293Zm7.293,14.707c-2.757,0-5-2.243-5-5,0-1.028.319-1.979.853-2.77l1.454,1.454c-.197.41-.307.866-.307,1.316,0,1.654,1.346,3,3,3,.45,0,.906-.11,1.316-.307l1.454,1.454c-.791.534-1.742.853-2.77.853Zm10.729-3.204c-1.02,2.265-2.468,4.216-4.276,5.796l-1.414-1.414c1.535-1.354,2.777-3.002,3.633-4.878-1.052-2.334-2.645-4.343-4.665-5.789-1.96-1.404-4.27-2.211-6.705-2.211h-.3l-2-2c.762-.239,1.558-.369,2.3-.369,2.5,0,4.703,1.002,6.553,2.617,1.808,1.58,3.257,3.531,4.277,5.797.462,1.025.462,2.135-.003,3.451Z"/>
  </svg>
);
const IcoRefresh = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M12,4c-1.948,0-3.785.768-5.162,2.081l-1.837-2.209v5.128h5.12l-2.145-2.577C8.905,5.514,10.145,4.981,11.5,4.981c2.757,0,5,2.243,5,5s-2.243,5-5,5c-1.429,0-2.733-.574-3.695-1.506l-1.42,1.461c1.341,1.302,3.16,2.045,5.115,2.045,4.071,0,7.342-3.178,7.494-7.213.008-.095,.006-.192-.006-.29C18.916,5.505,15.689,4,12,4Z"/>
  </svg>
);
const IcoArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
    <path d="M12,2a1,1,0,0,0-.707.293l-8,8a1,1,0,0,0,1.414,1.414L11,5.414V22a1,1,0,0,0,2,0V5.414l6.293,6.293a1,1,0,0,0,1.414-1.414l-8-8A1,1,0,0,0,12,2Z"/>
  </svg>
);
const IcoInfo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
    <path d="m12,0C5.383,0,0,5.383,0,12s5.383,12,12,12,12-5.383,12-12S18.617,0,12,0Zm0,22C6.486,22,2,17.514,2,12S6.486,2,12,2s10,4.486,10,10-4.486,10-10,10Zm0-13c-.553,0-1,.447-1,1v7c0,.553.447,1,1,1s1-.447,1-1v-7c0-.553-.447-1-1-1Zm0-4c-.828,0-1.5.672-1.5,1.5s.672,1.5,1.5,1.5,1.5-.672,1.5-1.5-.672-1.5-1.5-1.5Z"/>
  </svg>
);

// ============================================================
// TYPES
// ============================================================
type NodeType = 'MASTER' | 'STANDBY' | 'BACKUP' | 'CLIENT' | 'PARTNER';
type ConnStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR';
type Tab = 'nodes' | 'books';
type Book = 'A' | 'B' | 'C';

interface MT5Node {
  id: number;
  node_name: string;
  node_type: NodeType;
  server_address: string;
  manager_login: number;
  pump_flags: string[];
  groups_filter: string[];
  reconnect_interval_sec: number;
  heartbeat_interval_sec: number;
  is_enabled: boolean;
  is_master: boolean;
  connection_status: ConnStatus;
  last_connected_at: string;
  last_error: string;
  has_password: boolean;
}

// GroupNode represents a folder and its groups (built from flat API response)
interface GroupNode {
  folder: string;   // e.g. "real", "demo"
  groups: string[]; // full group names e.g. ["real\forex-hedge-usd-01"]
}

interface Assignment {
  id: number;       // assignment_id from API
  group_name: string; // full MT5 group name e.g. "real\forex-hedge-usd-01"
  book: Book;
  by: string;       // assigned_by
}

// ============================================================
// HELPERS
// ============================================================

interface FormData {
  node_name: string;
  node_type: NodeType;
  server_address: string;
  manager_login: string;
  password: string;
  pump_flags: string[];
  groups_filter: string;
  reconnect_interval_sec: string;
  heartbeat_interval_sec: string;
  is_enabled: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================
const ALL_FLAGS = ['USERS', 'GROUPS', 'SYMBOLS', 'ORDERS', 'POSITIONS', 'DEALS'];

const BOOK_COLOR: Record<Book, string> = { A: '#4ecdc4', B: '#e0b84d', C: '#7b9ddb' };
const BOOK_BG:    Record<Book, string> = { A: '#0f2828', B: '#282010', C: '#121828' };
const BOOK_BDR:   Record<Book, string> = { A: '#1f6060', B: '#6a5520', C: '#2f4a80' };

// Type descriptions shown in the select
const TYPE_DESCRIPTIONS: Record<NodeType, string> = {
  MASTER:  'Inception / licensed node — real-time sync with StandBy',
  STANDBY: 'Ready to promote to Master — compatible with Load Balancer',
  BACKUP:  'Master backup server',
  CLIENT:  'Institutional clients and Family Office',
  PARTNER: 'IB / White-label',
};

// ============================================================
// HELPERS
// ============================================================
function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Strip everything up to and including the last slash or backslash */
function shortPath(path: string) {
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return lastSep >= 0 ? path.slice(lastSep + 1) : path;
}

/** Build a folder→groups tree from flat MT5 group names (separator = \) */
function buildTree(groupNames: string[]): GroupNode[] {
  const folderMap = new Map<string, string[]>();
  for (const g of groupNames) {
    const sep = g.indexOf('\\');
    const folder = sep >= 0 ? g.slice(0, sep) : '(root)';
    if (!folderMap.has(folder)) folderMap.set(folder, []);
    folderMap.get(folder)!.push(g);
  }
  return Array.from(folderMap.entries()).map(([folder, groups]) => ({ folder, groups }));
}

function emptyForm(): FormData {
  return {
    node_name: '', node_type: 'MASTER', server_address: '',
    manager_login: '', password: '', pump_flags: [...ALL_FLAGS],
    groups_filter: '', reconnect_interval_sec: '5',
    heartbeat_interval_sec: '30', is_enabled: true,
  };
}

function nodeToForm(n: MT5Node): FormData {
  return {
    node_name: n.node_name, node_type: n.node_type,
    server_address: n.server_address, manager_login: String(n.manager_login),
    password: '',
    pump_flags: n.pump_flags.length ? [...n.pump_flags] : [...ALL_FLAGS],
    groups_filter: n.groups_filter.join(', '),
    reconnect_interval_sec: String(n.reconnect_interval_sec || 5),
    heartbeat_interval_sec: String(n.heartbeat_interval_sec || 30),
    is_enabled: n.is_enabled,
  };
}

/** Map API node response to local MT5Node shape */
function apiToNode(n: MT5NodeAPI): MT5Node {
  return {
    id: n.id,
    node_name: n.node_name,
    node_type: n.node_type as NodeType,
    server_address: n.server_address,
    manager_login: n.manager_login,
    pump_flags: n.pump_flags ?? [],
    groups_filter: n.groups_filter ?? [],
    reconnect_interval_sec: n.reconnect_interval_sec ?? 5,
    heartbeat_interval_sec: n.heartbeat_interval_sec ?? 30,
    is_enabled: n.is_enabled,
    is_master: n.is_master,
    connection_status: n.connection_status as ConnStatus,
    last_connected_at: n.last_connected_at ?? '',
    last_error: n.last_error ?? '',
    has_password: n.has_password,
  };
}

// ============================================================
// SHARED ATOMS
// ============================================================
function ConnBadge({ status }: { status: ConnStatus }) {
  const cfg: Record<ConnStatus, [string, string, string]> = {
    CONNECTED:    ['#66e07a', '#162a1c', '#2f6a3d'],
    CONNECTING:   ['#e0d066', '#2a2816', '#6a6530'],
    RECONNECTING: ['#e09a55', '#2a2016', '#6a4a2f'],
    DISCONNECTED: ['#a0a0b0', '#2a2a2c', '#484848'],
    ERROR:        ['#ff6b6b', '#2c1417', '#7a2f36'],
  };
  const [color, bg, border] = cfg[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: NodeType }) {
  const cfg: Record<NodeType, [string, string, string]> = {
    MASTER:  ['#a5c8f0', '#0f2035', '#1e4270'],
    STANDBY: ['#b8d4a5', '#1a2810', '#3a5830'],
    BACKUP:  ['#c4b5e0', '#1e1530', '#3d2860'],
    CLIENT:  ['#f0d0a5', '#2a1f0f', '#5a4020'],
    PARTNER: ['#d4a5c8', '#2a1025', '#5a2855'],
  };
  const [color, bg, border] = cfg[type];
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}>
      {type}
    </span>
  );
}

// ============================================================
// TOGGLE — pure inline-flex, no absolute children
// ============================================================
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center',
        width: 36, height: 20, borderRadius: 10, padding: 3,
        backgroundColor: checked ? '#163a3a' : '#383838',
        border: `1.5px solid ${checked ? '#4ecdc4' : '#505050'}`,
        cursor: 'pointer', flexShrink: 0, outline: 'none',
        transition: 'background-color .15s, border-color .15s',
      }}>
      <span style={{
        display: 'block', width: 12, height: 12, borderRadius: '50%',
        backgroundColor: checked ? '#4ecdc4' : '#888',
        transform: checked ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform .15s, background-color .15s',
      }} />
    </button>
  );
}

// ============================================================
// TRI-STATE CHECKBOX
// ============================================================
type CS = 'checked' | 'unchecked' | 'indeterminate';
function CBX({ state, onChange }: { state: CS; onChange: () => void }) {
  const on  = state === 'checked';
  const ind = state === 'indeterminate';
  return (
    <div onClick={(e) => { e.stopPropagation(); onChange(); }} style={{
      width: 14, height: 14, borderRadius: 3, flexShrink: 0, cursor: 'pointer',
      border: `1.5px solid ${on || ind ? '#4ecdc4' : '#505050'}`,
      backgroundColor: on || ind ? '#163a3a' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all .1s',
    }}>
      {on  && <svg viewBox="0 0 10 8" width="9" height="7" fill="none"><path d="M1 4l3 3 5-6" stroke="#4ecdc4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {ind && <div style={{ width: 8, height: 2, backgroundColor: '#4ecdc4', borderRadius: 1 }} />}
    </div>
  );
}

// ============================================================
// NODE CARD
// ============================================================
function NodeCard({ node, onEdit, onDelete, onConnect, onDisconnect, onPromote }: {
  node: MT5Node;
  onEdit:       (n: MT5Node) => void;
  onDelete:     (n: MT5Node) => void;
  onConnect:    (n: MT5Node) => void;
  onDisconnect: (n: MT5Node) => void;
  onPromote:    (n: MT5Node) => void;
}) {
  const isConn  = node.connection_status === 'CONNECTED';
  const isBusy  = node.connection_status === 'CONNECTING' || node.connection_status === 'RECONNECTING';
  const isMaster  = node.node_type === 'MASTER';
  const isStandby = node.node_type === 'STANDBY';

  return (
    <div className="panel flex flex-col overflow-hidden"
      style={{
        opacity: node.is_enabled ? 1 : 0.55,
        borderTop: isMaster ? '2px solid #a5c8f0' : isStandby ? '2px solid #b8d4a5' : '2px solid transparent',
      }}>

      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <TypeBadge type={node.node_type} />
            {!node.is_enabled && (
              <span className="text-xs" style={{ color: '#666' }}>· DISABLED</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-text-primary truncate">{node.node_name}</h3>
        </div>
        <ConnBadge status={node.connection_status} />
      </div>

      {/* Body */}
      <div className="px-3 pb-3 space-y-1.5 text-xs flex-1">
        <div className="flex gap-2">
          <span className="text-text-muted w-12 flex-shrink-0">Server</span>
          <span className="font-mono text-text-secondary truncate" title={node.server_address}>{node.server_address}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-text-muted w-12 flex-shrink-0">Login</span>
          <span className="font-mono text-text-primary">{node.manager_login}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-text-muted w-12 flex-shrink-0">Last on</span>
          <span className="text-text-secondary">{fmtDate(node.last_connected_at)}</span>
        </div>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {node.pump_flags.map(f => (
            <span key={f} className="px-1 py-0.5 rounded font-mono"
              style={{ backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }}>
              {f}
            </span>
          ))}
        </div>
        {node.last_error && (
          <div className="flex items-start gap-1.5 p-1.5 rounded mt-1"
            style={{ backgroundColor: '#2c1417', border: '1px solid #7a2f36' }}>
            <span className="flex-shrink-0 mt-px" style={{ color: '#ff6b6b' }}><IcoWarning /></span>
            <span style={{ color: '#ff6b6b' }} className="leading-tight">{node.last_error}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-border flex items-center gap-1.5 flex-wrap">
        {/* Connect / Disconnect — text-only buttons */}
        {isConn ? (
          <button onClick={() => onDisconnect(node)}
            className="btn btn-ghost text-xs border border-border px-2.5 py-1">
            Disconnect
          </button>
        ) : (
          <button onClick={() => onConnect(node)} disabled={isBusy || !node.is_enabled}
            className="btn text-xs px-2.5 py-1"
            style={isBusy || !node.is_enabled
              ? { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }
              : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
            {isBusy ? 'Connecting…' : 'Connect'}
          </button>
        )}

        {/* Promote button for STANDBY */}
        {isStandby && (
          <button onClick={() => onPromote(node)}
            title="Promote this node to MASTER — current MASTER will become STANDBY"
            className="btn text-xs px-2.5 py-1 flex items-center gap-1"
            style={{ backgroundColor: '#1a3020', color: '#b8d4a5', border: '1px solid #3a5830' }}>
            <IcoArrowUp /> Promote
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => onEdit(node)}
            className="btn btn-ghost text-xs border border-border px-2.5 py-1">
            Edit
          </button>
          <button onClick={() => onDelete(node)}
            className="btn text-xs px-2 py-1"
            style={{ backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
            <IcoTrash />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// NODE FORM MODAL — compact, 2-col wide
// ============================================================
function NodeModal({ mode, node, nodes, onClose, onSave }: {
  mode: 'add' | 'edit';
  node?: MT5Node;
  nodes: MT5Node[];
  onClose: () => void;
  onSave:  (f: FormData) => void;
}) {
  const [form, setForm] = useState<FormData>(
    mode === 'edit' && node ? nodeToForm(node) : emptyForm()
  );
  const [showPwd, setShowPwd] = useState(false);
  const [testState, setTestState] = useState<'idle'|'testing'|'ok'|'fail'>('idle');

  const upd = (k: keyof FormData, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const toggleFlag = (f: string) => upd('pump_flags',
    form.pump_flags.includes(f) ? form.pump_flags.filter(x => x !== f) : [...form.pump_flags, f]);

  // Enforce single MASTER / single STANDBY constraint warnings
  const hasMaster  = nodes.some(n => n.node_type === 'MASTER'  && (!node || n.id !== node.id));
  const hasStandby = nodes.some(n => n.node_type === 'STANDBY' && (!node || n.id !== node.id));
  const showMasterWarn  = form.node_type === 'MASTER'  && hasMaster;
  const showStandbyWarn = form.node_type === 'STANDBY' && hasStandby;

  const [testLatency, setTestLatency] = useState<number | null>(null);
  const runTest = async () => {
    if (!form.server_address || !form.manager_login) return;
    setTestState('testing');
    setTestLatency(null);
    try {
      // If editing an existing node use /test on that node; for new nodes use raw test
      if (mode === 'edit' && node) {
        const res = await mt5Api.testNode(node.id);
        setTestState(res.success ? 'ok' : 'fail');
        if (res.success) setTestLatency(res.latency_ms);
      } else {
        if (!form.password) { setTestState('fail'); return; }
        const res = await mt5Api.testRaw({
          server_address: form.server_address,
          manager_login: Number(form.manager_login),
          password: form.password,
        });
        setTestState(res.success ? 'ok' : 'fail');
        if (res.success) setTestLatency(res.latency_ms);
      }
    } catch {
      setTestState('fail');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel w-full mx-4 overflow-y-auto"
        style={{ backgroundColor: '#232225', maxWidth: 680, maxHeight: '88vh' }}>

        {/* Header — no icon */}
        <div className="panel-header">
          <span className="text-sm font-semibold text-text-primary">
            {mode === 'add' ? 'Add MT5 Node' : `Edit — ${node?.node_name}`}
          </span>
          <button onClick={onClose} className="btn-icon text-text-muted hover:text-text-primary">
            <IcoX size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Active primary warning ── */}
          {mode === 'edit' && node?.node_type === 'MASTER' && node?.connection_status === 'CONNECTED' && (
            <div className="flex items-start gap-2.5 p-3 rounded"
              style={{ backgroundColor: '#0f1e35', border: '1px solid #1e4270' }}>
              <span style={{ color: '#a5c8f0', flexShrink: 0, marginTop: 1 }}><IcoInfo /></span>
              <span className="text-xs leading-relaxed" style={{ color: '#a5c8f0' }}>
                This is the <strong>active primary node</strong>. Changes to server address, 
                credentials, or pump flags are saved immediately but require a{' '}
                <strong>service restart</strong> to take effect on the live connection.
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Node Name <span style={{ color: '#ff6b6b' }}>*</span>
              </label>
              <input className="input w-full text-sm" placeholder="e.g. NexRisk Master"
                value={form.node_name} onChange={e => upd('node_name', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Node Type <span style={{ color: '#ff6b6b' }}>*</span>
              </label>
              <select className="select w-full text-sm" value={form.node_type}
                onChange={e => upd('node_type', e.target.value)}>
                <option value="MASTER">MASTER</option>
                <option value="STANDBY">STANDBY</option>
                <option value="BACKUP">BACKUP</option>
                <option value="CLIENT">CLIENT</option>
                <option value="PARTNER">PARTNER</option>
              </select>
              {/* Type description */}
              <p className="text-xs text-text-muted mt-1 leading-snug">{TYPE_DESCRIPTIONS[form.node_type]}</p>
              {/* Uniqueness warnings */}
              {showMasterWarn && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#e0d066' }}>
                  <IcoWarning /> A MASTER node already exists. Promoting this will demote the existing one.
                </p>
              )}
              {showStandbyWarn && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#e0d066' }}>
                  <IcoWarning /> A STANDBY node already exists. Only one STANDBY is allowed.
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Server */}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Server Address <span style={{ color: '#ff6b6b' }}>*</span>
            </label>
            <input className="input w-full text-sm font-mono"
              placeholder="host:port — e.g. mt5-live.broker.com:443"
              value={form.server_address} onChange={e => upd('server_address', e.target.value)} />
          </div>

          {/* Row 3: Login + Password + Test */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Manager Login <span style={{ color: '#ff6b6b' }}>*</span>
              </label>
              <input className="input w-full text-sm font-mono" type="text"
                placeholder="e.g. 500"
                value={form.manager_login} onChange={e => upd('manager_login', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Password
                {mode === 'edit'
                  ? <span className="font-normal text-text-muted ml-1">(blank = keep)</span>
                  : <span style={{ color: '#ff6b6b' }}> *</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <input className="input w-full text-sm" style={{ paddingRight: 36 }}
                  type={showPwd ? 'text' : 'password'}
                  placeholder={mode === 'edit' ? '••••••••' : 'Password'}
                  value={form.password} onChange={e => upd('password', e.target.value)} />
                <button type="button" onClick={() => setShowPwd(s => !s)}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderLeft: '1px solid #444',
                  }}
                  className="text-text-muted hover:text-text-primary transition-colors">
                  {showPwd ? <IcoEyeOff /> : <IcoEye />}
                </button>
              </div>
            </div>
          </div>

          {/* Test connection */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={runTest} disabled={testState === 'testing'}
              className="btn btn-ghost text-xs border border-border px-3 py-1.5">
              Test Connection
            </button>
            {testState === 'testing' && <span className="text-xs text-text-muted">Connecting…</span>}
            {testState === 'ok'      && <span className="text-xs" style={{ color: '#66e07a' }}>Connected{testLatency ? ` — ${testLatency}ms` : ''}</span>}
            {testState === 'fail'    && <span className="text-xs" style={{ color: '#ff6b6b' }}>Connection failed</span>}
          </div>

          <div className="border-t border-border" />

          {/* Pump Flags + Groups Filter side-by-side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <label className="text-xs text-text-muted">Pump Flags</label>
                <span className="group relative cursor-help">
                  <span className="text-text-muted"><IcoInfo /></span>
                  <span className="absolute left-5 top-0 z-10 hidden group-hover:block w-56 text-xs text-text-secondary rounded p-2 shadow-lg leading-relaxed"
                    style={{ backgroundColor: '#2a2a2c', border: '1px solid #404040' }}>
                    Selects which real-time data streams this node subscribes to from the MT5 server.
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_FLAGS.map(flag => (
                  <button key={flag} type="button" onClick={() => toggleFlag(flag)}
                    className="px-2 py-0.5 rounded text-xs font-semibold transition-colors"
                    style={form.pump_flags.includes(flag)
                      ? { backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }
                      : { color: '#888', border: '1px solid #444', backgroundColor: 'transparent' }}>
                    {flag}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-2">
                Groups Filter <span className="font-normal">(wildcards; blank = all)</span>
              </label>
              <input className="input w-full text-sm font-mono" placeholder='e.g. demo\*, real\*'
                value={form.groups_filter} onChange={e => upd('groups_filter', e.target.value)} />
            </div>
          </div>

          {/* Reconnect + Heartbeat + Enabled in one row */}
          <div className="grid grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs text-text-muted mb-1">Reconnect (sec)</label>
              <input className="input w-full text-sm font-mono" type="text"
                value={form.reconnect_interval_sec}
                onChange={e => upd('reconnect_interval_sec', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Heartbeat (sec)</label>
              <input className="input w-full text-sm font-mono" type="text"
                value={form.heartbeat_interval_sec}
                onChange={e => upd('heartbeat_interval_sec', e.target.value)} />
            </div>
            <div className="flex items-center gap-2.5 pb-0.5">
              <Toggle checked={form.is_enabled} onChange={v => upd('is_enabled', v)} />
              <span className="text-sm text-text-primary">Enabled</span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
            <button onClick={() => onSave(form)} className="btn btn-primary text-sm">
              {mode === 'add' ? 'Add Node' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DELETE MODAL
// ============================================================
function DeleteModal({ node, onClose, onConfirm }: {
  node: MT5Node; onClose: () => void; onConfirm: () => void;
}) {
  const isProtected = node.node_type === 'MASTER';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel w-full max-w-sm mx-4" style={{ backgroundColor: '#232225' }}>
        <div className="panel-header">
          <span className="text-sm font-semibold" style={{ color: '#ff6b6b' }}>Delete Node</span>
          <button onClick={onClose} className="btn-icon text-text-muted"><IcoX /></button>
        </div>
        <div className="p-5 space-y-4">
          {isProtected && (
            <div className="flex items-start gap-2 p-3 rounded text-xs"
              style={{ backgroundColor: '#2a1810', border: '1px solid #7a3f20' }}>
              <span style={{ color: '#ff6b6b', flexShrink: 0, marginTop: 1 }}><IcoWarning /></span>
              <span style={{ color: '#e09a55' }}>
                The <strong>MASTER</strong> node cannot be deleted. Promote the STANDBY node first, then delete.
              </span>
            </div>
          )}
          <p className="text-sm text-text-primary">
            Permanently delete <strong>{node.node_name}</strong>?
          </p>
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
            <button onClick={onConfirm} disabled={isProtected} className="btn text-sm"
              style={isProtected
                ? { backgroundColor: '#3a3a3c', color: '#666', cursor: 'not-allowed' }
                : { backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
              Delete Node
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PROMOTE CONFIRM MODAL
// ============================================================
function PromoteModal({ standbyNode, masterNode, onClose, onConfirm }: {
  standbyNode: MT5Node;
  masterNode?: MT5Node;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel w-full max-w-sm mx-4" style={{ backgroundColor: '#232225' }}>
        <div className="panel-header">
          <span className="text-sm font-semibold text-text-primary">Promote to Master</span>
          <button onClick={onClose} className="btn-icon text-text-muted"><IcoX /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-text-primary space-y-2">
            <p>
              <strong>{standbyNode.node_name}</strong> will become the new <strong>MASTER</strong> node.
            </p>
            {masterNode && (
              <p className="text-text-secondary">
                <strong>{masterNode.node_name}</strong> will be automatically demoted to <strong>STANDBY</strong>.
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
            <button onClick={onConfirm} className="btn btn-primary text-sm">Confirm Promotion</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DISCONNECT MASTER CONFIRMATION MODAL
// ============================================================
function DisconnectMasterModal({ node, onClose, onConfirm }: {
  node: MT5Node;
  onClose:   () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel w-full max-w-sm mx-4" style={{ backgroundColor: '#232225' }}>
        <div className="panel-header">
          <span className="text-sm font-semibold" style={{ color: '#e0d066' }}>
            Disconnect Primary Node
          </span>
          <button onClick={onClose} className="btn-icon text-text-muted"><IcoX /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Severity callout */}
          <div className="flex items-start gap-2.5 p-3 rounded"
            style={{ backgroundColor: '#28220a', border: '1px solid #6a6530' }}>
            <span style={{ color: '#e0d066', flexShrink: 0, marginTop: 1 }}><IcoWarning /></span>
            <div className="text-xs leading-relaxed" style={{ color: '#e0d066' }}>
              <strong>{node.node_name}</strong> is the <strong>active primary node</strong>. 
              Disconnecting it will <strong>halt all real-time trade processing</strong> — 
              no ticks, positions, orders, or deals will flow until it reconnects.
            </div>
          </div>
          <p className="text-sm text-text-primary">
            Are you sure you want to disconnect the primary node?
          </p>
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
            <button onClick={onConfirm}
              className="btn text-sm"
              style={{ backgroundColor: '#28220a', color: '#e0d066', border: '1px solid #6a6530' }}>
              Disconnect Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// NODES TAB
// ============================================================
function NodesTab({ nodes, onEdit, onDelete, onConnect, onDisconnect, onPromote, onAdd }: {
  nodes: MT5Node[];
  onEdit:       (n: MT5Node) => void;
  onDelete:     (n: MT5Node) => void;
  onConnect:    (n: MT5Node) => void;
  onDisconnect: (n: MT5Node) => void;
  onPromote:    (n: MT5Node) => void;
  onAdd:        () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={onAdd} className="btn btn-primary text-xs flex items-center gap-1.5">
          <IcoPlus /> Add Node
        </button>
      </div>
      {nodes.length === 0 ? (
        <div className="panel flex items-center justify-center" style={{ minHeight: 220 }}>
          <div className="text-center">
            <p className="text-text-muted text-sm mb-3">No nodes configured</p>
            <button onClick={onAdd} className="btn btn-primary text-xs flex items-center gap-1.5 mx-auto">
              <IcoPlus /> Add Node
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {nodes.map(node => (
            <NodeCard key={node.id} node={node}
              onEdit={onEdit} onDelete={onDelete}
              onConnect={onConnect} onDisconnect={onDisconnect}
              onPromote={onPromote} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BOOK CONFIG — assignment rows with inline re-assign
// ============================================================
function ReassignDropdown({ currentBook, onReassign, onClose }: {
  currentBook: Book;
  onReassign: (b: Book) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-20 rounded border border-border shadow-lg"
      style={{ backgroundColor: '#2a2a2c', minWidth: 120 }}>
      {(['A','B','C'] as Book[]).filter(b => b !== currentBook).map(b => (
        <button key={b} onClick={() => { onReassign(b); onClose(); }}
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: BOOK_COLOR[b], display: 'inline-block', flexShrink: 0 }} />
          Move to {b}-Book
        </button>
      ))}
    </div>
  );
}

function AssignRow({ a, onRemove, onReassign }: {
  a: Assignment;
  onRemove:   (id: number) => void;
  onReassign: (id: number, b: Book) => void;
}) {
  const [dd, setDd] = useState(false);
  return (
    <div className="flex items-center gap-2 py-1.5 text-xs border-b border-border last:border-0">
      <span className="font-mono text-text-secondary truncate flex-1" title={a.group_name}>{shortPath(a.group_name)}</span>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => setDd(s => !s)}
          className="text-xs px-1.5 py-0.5 rounded hover:bg-surface-hover transition-colors"
          style={{ color: '#a0a0b0' }}>
          Re-assign
        </button>
        {dd && <ReassignDropdown currentBook={a.book} onReassign={b => onReassign(a.id, b)} onClose={() => setDd(false)} />}
        <button onClick={() => onRemove(a.id)} className="text-text-muted hover:text-red-400 transition-colors px-1">
          <IcoX size={11} />
        </button>
      </div>
    </div>
  );
}

function BookPanel({ book, rows, onRemove, onReassign }: {
  book: Book; rows: Assignment[];
  onRemove:   (id: number) => void;
  onReassign: (id: number, b: Book) => void;
}) {
  return (
    <div className="panel overflow-hidden flex-1"
      style={{ borderLeft: `3px solid ${BOOK_COLOR[book]}` }}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">{book}-Book</span>
        <span className="text-xs font-mono text-text-muted">{rows.length} group{rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="px-3 py-1.5 overflow-y-auto" style={{ maxHeight: 140 }}>
        {rows.length === 0
          ? <p className="text-xs text-text-muted py-2">No groups assigned</p>
          : rows.map(a => <AssignRow key={a.id} a={a} onRemove={onRemove} onReassign={onReassign} />)}
      </div>
    </div>
  );
}

// ============================================================
// GROUP TREE — driven by live data, folder→groups two levels
// ============================================================
function GroupTree({ tree, assignments, selected, onToggleGroup, onToggleFolder }: {
  tree: GroupNode[];
  assignments: Assignment[];
  selected: Set<string>;
  onToggleGroup:  (groupName: string) => void;
  onToggleFolder: (groupNames: string[]) => void;
}) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  // Auto-open all folders when tree first loads
  useEffect(() => {
    if (tree.length > 0) setOpenFolders(new Set(tree.map(t => t.folder)));
  }, [tree.length]);

  const assignMap = new Map(assignments.map(a => [a.group_name, a.book]));
  const toggleFolder = (folder: string) =>
    setOpenFolders(prev => { const n = new Set(prev); n.has(folder) ? n.delete(folder) : n.add(folder); return n; });

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-xs text-text-muted">No groups — fetch from a connected node</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map(({ folder, groups }) => {
        const selCount = groups.filter(g => selected.has(g)).length;
        const folderState: CS =
          selCount === 0 ? 'unchecked' :
          selCount === groups.length ? 'checked' : 'indeterminate';
        const isOpen = openFolders.has(folder);

        return (
          <div key={folder}>
            {/* Folder row */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded"
              style={{ backgroundColor: isOpen ? '#272629' : 'transparent' }}>
              <CBX state={folderState} onChange={() => onToggleFolder(groups)} />
              <button onClick={() => toggleFolder(folder)}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
                <span style={{
                  transition: 'transform .12s',
                  transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  display: 'inline-flex', color: '#808080',
                }}>
                  <IcoChevronDown />
                </span>
                <span className="text-xs font-mono font-semibold text-text-muted uppercase tracking-widest">{folder}</span>
                <span className="text-xs text-text-muted ml-1">({groups.length})</span>
              </button>
            </div>

            {/* Group rows */}
            {isOpen && (
              <div className="ml-5 border-l border-border">
                {groups.map(groupName => {
                  const book = assignMap.get(groupName);
                  const shortName = shortPath(groupName);
                  return (
                    <div key={groupName}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-hover"
                      style={{ backgroundColor: selected.has(groupName) ? '#1a2a2a' : 'transparent' }}>
                      <CBX
                        state={selected.has(groupName) ? 'checked' : 'unchecked'}
                        onChange={() => onToggleGroup(groupName)}
                      />
                      <span className="text-xs font-mono text-text-secondary flex-1 truncate" title={groupName}>
                        {shortName}
                      </span>
                      {book
                        ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded ml-auto flex-shrink-0"
                            style={{ color: BOOK_COLOR[book], backgroundColor: BOOK_BG[book], border: `1px solid ${BOOK_BDR[book]}` }}>
                            {book}-Book
                          </span>
                        : <span className="text-xs text-text-muted ml-auto flex-shrink-0">—</span>
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
// ============================================================
// BOOK MAPPING TAB — fully wired to API
// ============================================================
function BookMappingTab({ nodes }: { nodes: MT5Node[] }) {
  const [nodeId,      setNodeId]      = useState(nodes[0]?.id ?? -1);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tree,        setTree]        = useState<GroupNode[]>([]);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [targetBook,  setTargetBook]  = useState<Book>('A');
  const [loadingAsgn, setLoadingAsgn] = useState(false);
  const [loadingGrps, setLoadingGrps] = useState(false);
  const [assigning,   setAssigning]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const selNode = nodes.find(n => n.id === nodeId);
  const isConn  = selNode?.connection_status === 'CONNECTED';

  // Load assignments whenever the selected node changes
  const loadAssignments = useCallback(async (id: number) => {
    setLoadingAsgn(true);
    setError(null);
    try {
      const res = await mt5Api.getNodeBooks(id);
      const flat: Assignment[] = [];
      for (const bk of res.books) {
        for (const g of bk.groups) {
          flat.push({
            id: g.assignment_id,
            group_name: g.group_name,
            book: bk.book_name as Book,
            by: g.assigned_by,
          });
        }
      }
      setAssignments(flat);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load assignments');
    } finally {
      setLoadingAsgn(false);
    }
  }, []);

  useEffect(() => {
    if (nodeId >= 0) loadAssignments(nodeId);
  }, [nodeId, loadAssignments]);

  // Auto-select node when list first loads
  useEffect(() => {
    if (nodes.length > 0 && nodeId === -1) setNodeId(nodes[0].id);
  }, [nodes, nodeId]);

  const handleFetchGroups = async () => {
    if (!isConn || nodeId < 0) return;
    setLoadingGrps(true);
    setError(null);
    try {
      const res = await mt5Api.getNodeGroups(nodeId);
      setTree(buildTree(res.groups.map(g => g.group)));
      setSelected(new Set());
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to fetch groups');
    } finally {
      setLoadingGrps(false);
    }
  };

  const toggleGroup = (groupName: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(groupName) ? n.delete(groupName) : n.add(groupName); return n; });

  const toggleFolder = (groupNames: string[]) =>
    setSelected(prev => {
      const n = new Set(prev);
      const allSel = groupNames.every(g => n.has(g));
      groupNames.forEach(g => allSel ? n.delete(g) : n.add(g));
      return n;
    });

  const handleAssign = async () => {
    if (!selected.size || nodeId < 0) return;
    setAssigning(true);
    setError(null);
    try {
      await mt5Api.assignGroups(nodeId, targetBook, [...selected]);
      await loadAssignments(nodeId);
      setSelected(new Set());
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const removeAssignment = async (id: number) => {
    if (nodeId < 0) return;
    try {
      await mt5Api.removeAssignment(nodeId, id);
      setAssignments(prev => prev.filter(a => a.id !== id));
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Remove failed');
    }
  };

  // Reassign = remove old then assign to new book
  const reassignBook = async (id: number, newBook: Book) => {
    if (nodeId < 0) return;
    const asgn = assignments.find(a => a.id === id);
    if (!asgn) return;
    try {
      await mt5Api.removeAssignment(nodeId, id);
      await mt5Api.assignGroups(nodeId, newBook, [asgn.group_name]);
      await loadAssignments(nodeId);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Reassignment failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Node selector */}
      <div className="panel p-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-text-primary flex-shrink-0">Source Node</span>
        <select className="select text-sm" style={{ minWidth: 220 }}
          value={nodeId} onChange={e => { setNodeId(Number(e.target.value)); setTree([]); setSelected(new Set()); }}>
          {nodes.map(n => <option key={n.id} value={n.id}>{n.node_name} [{n.node_type}]</option>)}
        </select>
        {selNode && <ConnBadge status={selNode.connection_status} />}
        {selNode && <TypeBadge type={selNode.node_type} />}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleFetchGroups} disabled={!isConn || loadingGrps}
            className="btn text-xs flex items-center gap-1.5 border border-border"
            style={isConn
              ? { backgroundColor: '#162a1c', color: '#66e07a' }
              : { opacity: .4, cursor: 'not-allowed', color: '#888' }}>
            <IcoRefresh /> {loadingGrps ? 'Fetching…' : 'Fetch Groups'}
          </button>
          {!isConn && <span className="text-xs text-text-muted">Connect node first</span>}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded text-xs"
          style={{ backgroundColor: '#2c1417', border: '1px solid #7a2f36', color: '#ff6b6b' }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}><IcoWarning /></span>
          {error}
        </div>
      )}

      {/* Two-column */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* LEFT: Group tree */}
        <div className="panel flex flex-col overflow-hidden">
          <div className="panel-header">
            <span className="text-sm font-semibold text-text-primary">MT5 Groups</span>
            <span className="text-xs text-text-muted">
              {selected.size > 0 ? `${selected.size} selected` : tree.length > 0 ? 'Select to assign' : 'Fetch groups to begin'}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {loadingAsgn
              ? <p className="text-xs text-text-muted py-4 text-center">Loading…</p>
              : <GroupTree
                  tree={tree}
                  assignments={assignments}
                  selected={selected}
                  onToggleGroup={toggleGroup}
                  onToggleFolder={toggleFolder}
                />
            }
          </div>
          {/* Assign footer */}
          <div className="px-3 py-2.5 border-t border-border flex items-center gap-2">
            <span className="text-xs text-text-muted flex-shrink-0">Assign to</span>
            <div className="flex gap-1">
              {(['A','B','C'] as Book[]).map(b => (
                <button key={b} onClick={() => setTargetBook(b)}
                  className="px-2.5 py-1 rounded text-xs font-semibold transition-colors"
                  style={targetBook === b
                    ? { color: BOOK_COLOR[b], backgroundColor: BOOK_BG[b], border: `1px solid ${BOOK_BDR[b]}` }
                    : { color: '#888', border: '1px solid #444', backgroundColor: 'transparent' }}>
                  {b}-Book
                </button>
              ))}
            </div>
            <button onClick={handleAssign} disabled={!selected.size || assigning}
              className="ml-auto btn text-xs px-3 py-1"
              style={selected.size && !assigning
                ? { backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }
                : { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }}>
              {assigning ? 'Assigning…' : `Assign${selected.size ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </div>

        {/* RIGHT: Book panels */}
        <div className="flex flex-col gap-3">
          {(['A','B','C'] as Book[]).map(b => (
            <BookPanel key={b} book={b} rows={assignments.filter(a => a.book === b)}
              onRemove={removeAssignment} onReassign={reassignBook} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export function NodeManagementPage() {
  const [tab,          setTab]          = useState<Tab>('nodes');
  const [nodes,        setNodes]        = useState<MT5Node[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [formModal,    setFormModal]    = useState<{ mode: 'add'|'edit'; node?: MT5Node } | null>(null);
  const [deleteModal,  setDeleteModal]  = useState<MT5Node | null>(null);
  const [promoteModal, setPromoteModal] = useState<MT5Node | null>(null);
  const [disconnectModal, setDisconnectModal] = useState<MT5Node | null>(null);
  const [toast,        setToast]        = useState<string | null>(null);
  const [toastType,    setToastType]    = useState<'success'|'warn'|'error'>('success');

  const showToast = (msg: string, type: 'success'|'warn'|'error' = 'success') => {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(null), 4000);
  };

  const connected = nodes.filter(n => n.connection_status === 'CONNECTED').length;
  const master    = nodes.find(n => n.node_type === 'MASTER');
  const standby   = nodes.find(n => n.node_type === 'STANDBY');

  // ── Initial load ─────────────────────────────────────────
  const loadNodes = useCallback(async () => {
    try {
      const res = await mt5Api.getNodes();
      setNodes(res.nodes.map(apiToNode));
    } catch (e: unknown) {
      showToast((e as Error).message || 'Failed to load nodes', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNodes(); }, [loadNodes]);

  // ── Status polling every 10 seconds ──────────────────────
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await mt5Api.getNodeStatus();
        setNodes(prev => prev.map(n => {
          const s = res.nodes.find(x => x.node_id === n.id);
          if (!s) return n;
          return {
            ...n,
            connection_status: s.connection_status as ConnStatus,
            last_connected_at: s.last_connected_at ?? n.last_connected_at,
            last_error: s.last_error ?? n.last_error,
            is_master: s.is_master,
          };
        }));
      } catch {
        // Silent — don't interrupt the UI for polling errors
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  // ── CRUD handlers ─────────────────────────────────────────
  const handleSave = async (form: FormData) => {
    try {
      if (formModal?.mode === 'add') {
        const res = await mt5Api.createNode({
          node_name:              form.node_name,
          node_type:              form.node_type,
          server_address:         form.server_address,
          manager_login:          Number(form.manager_login),
          password:               form.password,
          pump_flags:             form.pump_flags,
          groups_filter:          form.groups_filter ? form.groups_filter.split(',').map(s => s.trim()).filter(Boolean) : [],
          reconnect_interval_sec: Number(form.reconnect_interval_sec) || 5,
          heartbeat_interval_sec: Number(form.heartbeat_interval_sec) || 30,
          is_enabled:             form.is_enabled,
          created_by:             'admin',
        });
        // Reload full list to get the complete node object back
        await loadNodes();
        showToast(`Node "${res.node.node_name ?? form.node_name}" created`);
      } else if (formModal?.mode === 'edit' && formModal.node) {
        const patch: Parameters<typeof mt5Api.updateNode>[1] = {
          node_name:              form.node_name,
          node_type:              form.node_type,
          server_address:         form.server_address,
          manager_login:          Number(form.manager_login),
          pump_flags:             form.pump_flags,
          groups_filter:          form.groups_filter ? form.groups_filter.split(',').map(s => s.trim()).filter(Boolean) : [],
          reconnect_interval_sec: Number(form.reconnect_interval_sec) || 5,
          heartbeat_interval_sec: Number(form.heartbeat_interval_sec) || 30,
          is_enabled:             form.is_enabled,
        };
        if (form.password) patch.password = form.password;
        const res = await mt5Api.updateNode(formModal.node.id, patch);
        await loadNodes();
        // Backend signals restart_required when connection-critical params changed
        if (res.restart_required) {
          showToast(`"${form.node_name}" saved — service restart required to apply connection changes`, 'warn');
        } else {
          showToast(`Node "${form.node_name}" updated`);
        }
      }
    } catch (e: unknown) {
      showToast((e as Error).message || 'Save failed', 'error');
    }
    setFormModal(null);
  };

  const handleConnect = async (node: MT5Node) => {
    // Optimistic UI: set CONNECTING immediately
    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, connection_status: 'CONNECTING' } : n));
    try {
      const res = await mt5Api.connectNode(node.id);
      setNodes(prev => prev.map(n => n.id === node.id
        ? { ...n, connection_status: res.connection_status as ConnStatus, last_error: res.last_error ?? '', last_connected_at: new Date().toISOString() }
        : n));
      if (res.success) showToast(`${node.node_name} connected`);
      else showToast(res.last_error || 'Connection failed', 'error');
    } catch (e: unknown) {
      setNodes(prev => prev.map(n => n.id === node.id ? { ...n, connection_status: 'ERROR' } : n));
      showToast((e as Error).message || 'Connection failed', 'error');
    }
  };

  const handleDisconnect = async (node: MT5Node) => {
    // Primary node — requires explicit confirmation before we call the API
    if (node.is_master && node.connection_status === 'CONNECTED') {
      setDisconnectModal(node);
      return;
    }
    await doDisconnect(node);
  };

  const doDisconnect = async (node: MT5Node) => {
    try {
      const res = await mt5Api.disconnectNode(node.id);
      setNodes(prev => prev.map(n => n.id === node.id ? { ...n, connection_status: 'DISCONNECTED' } : n));
      if (res.warning) showToast(res.warning, 'warn');
      else showToast(`${node.node_name} disconnected`);
    } catch (e: unknown) {
      showToast((e as Error).message || 'Disconnect failed', 'error');
    }
  };

  const handlePromoteConfirm = async () => {
    if (!promoteModal) return;
    try {
      // Mark new node as primary — backend handles demotion of old primary
      await mt5Api.updateNode(promoteModal.id, { is_master: true, node_type: 'MASTER' });
      await loadNodes();
      showToast(`${promoteModal.node_name} promoted to MASTER`);
    } catch (e: unknown) {
      showToast((e as Error).message || 'Promotion failed', 'error');
    }
    setPromoteModal(null);
  };

  const handleDelete = async () => {
    if (!deleteModal || deleteModal.node_type === 'MASTER') return;
    try {
      await mt5Api.deleteNode(deleteModal.id);
      setNodes(prev => prev.filter(n => n.id !== deleteModal.id));
      showToast(`${deleteModal.node_name} deleted`);
    } catch (e: unknown) {
      showToast((e as Error).message || 'Delete failed', 'error');
    }
    setDeleteModal(null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Page header */}
      <div className="px-6 pt-5 pb-0 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">MT5 Servers</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Manage MT5 node connections and map trading groups to risk books
            </p>
          </div>
          {/* Stats + toast + role badge */}
          <div className="flex items-center gap-4">
            {toast && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
                style={
                  toastType === 'success' ? { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }
                  : toastType === 'warn'  ? { backgroundColor: '#28220a', color: '#e0d066', border: '1px solid #6a6530' }
                  :                        { backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }
                }>
                <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                  backgroundColor: toastType === 'success' ? '#66e07a' : toastType === 'warn' ? '#e0d066' : '#ff6b6b' }} />
                {toast}
              </span>
            )}
            {!loading && (
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span>
                  <span className="text-text-primary font-mono">{nodes.length}</span> nodes
                </span>
                <span className="opacity-30">·</span>
                <span>
                  <span className="font-mono" style={{ color: connected > 0 ? '#66e07a' : '#a0a0b0' }}>{connected}</span> connected
                </span>
                <span className="opacity-30">·</span>
                <span>Master: <span className="text-text-primary">{master?.node_name ?? '—'}</span></span>
                {standby && (
                  <>
                    <span className="opacity-30">·</span>
                    <span>StandBy: <span className="text-text-primary">{standby.node_name}</span></span>
                  </>
                )}
              </div>
            )}
            <span className="px-2.5 py-1 rounded text-xs font-medium"
              style={{ backgroundColor: '#0f2035', color: '#a5c8f0', border: '1px solid #1e4270' }}>
              IT Admin
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex">
          {([
            { id: 'nodes' as Tab, label: 'Node Registry' },
            { id: 'books' as Tab, label: 'Book Configuration' },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium transition-colors border-b-2',
                tab === t.id
                  ? 'text-accent border-accent'
                  : 'text-text-secondary border-transparent hover:text-text-primary'
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-text-muted">Loading nodes…</span>
          </div>
        ) : (
          <>
            {tab === 'nodes' && (
              <NodesTab nodes={nodes}
                onEdit={n => setFormModal({ mode: 'edit', node: n })}
                onDelete={n => setDeleteModal(n)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onPromote={n => setPromoteModal(n)}
                onAdd={() => setFormModal({ mode: 'add' })} />
            )}
            {tab === 'books' && <BookMappingTab nodes={nodes} />}
          </>
        )}
      </div>

      {formModal && (
        <NodeModal mode={formModal.mode} node={formModal.node} nodes={nodes}
          onClose={() => setFormModal(null)} onSave={handleSave} />
      )}
      {deleteModal && (
        <DeleteModal node={deleteModal}
          onClose={() => setDeleteModal(null)} onConfirm={handleDelete} />
      )}
      {promoteModal && (
        <PromoteModal
          standbyNode={promoteModal}
          masterNode={master}
          onClose={() => setPromoteModal(null)}
          onConfirm={handlePromoteConfirm} />
      )}
      {disconnectModal && (
        <DisconnectMasterModal
          node={disconnectModal}
          onClose={() => setDisconnectModal(null)}
          onConfirm={async () => {
            const node = disconnectModal;
            setDisconnectModal(null);
            await doDisconnect(node);
          }} />
      )}
    </div>
  );
}
// ============================================================
// User Management Page
// Tailwind design tokens match tailwind.config.ts exactly.
// text-text-primary #fff · text-text-secondary #e2e4ec
// text-text-muted #d2d6e2 · text-accent #49b3b3
// text-pnl-positive #66e07a · text-risk-critical #ff5c5c
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '@/stores/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PlatformUser {
  id: string;
  email: string;
  role: string;         // normalised from role_name
  role_name?: string;   // raw C++ field
  role_label: string;
  is_active: boolean;
  is_enrolled: boolean; // normalised from totp_enrolled
  totp_enrolled?: boolean;
  is_root?: boolean;
  created_at?: string;
}

interface Role {
  id: number;
  name: string;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await fetch(path, { credentials: 'include', ...init });

  if (res.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) {
      res = await fetch(path, { credentials: 'include', ...init });
    } else {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const usersApi = {
  list: async (): Promise<{ users: PlatformUser[]; total: number }> => {
    const raw = await apiFetch<unknown>('/api/v1/users');
    const arr = (Array.isArray(raw) ? raw : ((raw as { users?: unknown[] }).users ?? [])) as PlatformUser[];
    const users = arr.map(u => ({
      ...u,
      role: u.role_name ?? u.role ?? '',
      is_enrolled: u.totp_enrolled ?? u.is_enrolled ?? false,
    }));
    return { users, total: users.length };
  },

  create: (email: string, role_id: number, first_name?: string, last_name?: string) =>
    apiFetch<{ user: PlatformUser; invite_expires_at: string; invite_sent: boolean; message: string }>(
      '/api/v1/users',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role_id, ...(first_name ? { first_name } : {}), ...(last_name ? { last_name } : {}) }) }
    ),

  update: (id: string, patch: { role_id?: number; is_active?: boolean }) =>
    apiFetch<PlatformUser>(`/api/v1/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  deactivate: (id: string) =>
    apiFetch<unknown>(`/api/v1/users/${id}`, { method: 'DELETE' }),

  reissueInvite: (id: string) =>
    apiFetch<{ user: { id: string; email: string }; invite_expires_at: string; invite_sent: boolean; message: string }>(
      `/api/v1/users/${id}/invite`, { method: 'POST' }
    ),

  roles: async (): Promise<Role[]> => {
    const raw = await apiFetch<unknown>('/api/v1/roles');
    if (Array.isArray(raw)) return raw as Role[];
    return ((raw as { roles?: Role[] }).roles ?? []);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Badges
// ─────────────────────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wide text-pnl-positive bg-risk-low/10 border border-risk-low/30">
      <span className="w-1.5 h-1.5 rounded-full bg-pnl-positive" />Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wide text-text-muted bg-surface border border-border-muted">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />Inactive
    </span>
  );
}

function EnrollmentBadge({ user }: { user: PlatformUser }) {
  if (user.role === 'root')     return <span className="text-sm text-text-muted font-mono">N/A</span>;
  if (!user.is_active)          return <span className="text-sm text-text-muted font-mono">—</span>;
  if (user.is_enrolled == null) return <span className="text-sm text-text-muted font-mono">—</span>;
  return user.is_enrolled ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wide text-accent bg-accent-subtle border border-accent-muted/40">
      <span className="w-1.5 h-1.5 rounded-full bg-accent" />Enrolled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wide text-risk-medium bg-risk-medium-bg border border-risk-medium-border/50">
      <span className="w-1.5 h-1.5 rounded-full bg-risk-medium" />Pending
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared modal shell
// ─────────────────────────────────────────────────────────────────────────────

function ModalShell({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8">
        <h2 className="text-base font-semibold text-text-primary mb-1 font-mono">{title}</h2>
        {subtitle && <p className="text-sm text-text-secondary mb-6 font-mono truncate">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded px-3 py-2 text-sm text-text-primary bg-background border border-border outline-none focus:border-accent font-mono placeholder:text-text-muted transition-colors";
const labelCls = "block text-xs text-text-secondary uppercase tracking-widest mb-2 font-mono";

function InlineError({ msg }: { msg: string }) {
  return (
    <div className="mb-4 px-3 py-2 rounded border border-risk-critical/35 bg-risk-critical-bg text-sm text-risk-critical font-mono">
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add User modal
// ─────────────────────────────────────────────────────────────────────────────

function AddUserModal({ roles, onClose, onCreated }: {
  roles: Role[]; onClose: () => void; onCreated: (msg: string) => void;
}) {
  const [email, setEmail]         = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [roleId, setRoleId]       = useState<number>(roles[0]?.id ?? 0);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  async function submit() {
    setError('');
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!roleId)       { setError('Select a role.'); return; }
    setLoading(true);
    try {
      const res = await usersApi.create(email.trim(), roleId, firstName.trim() || undefined, lastName.trim() || undefined);
      onCreated(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Add User" subtitle="A setup invitation will be emailed to the new user." onClose={onClose}>
      {error && <InlineError msg={error} />}
      <div className="mb-4">
        <label className={labelCls}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void submit()}
          className={inputCls} placeholder="user@example.com" autoFocus disabled={loading} />
      </div>
      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className={labelCls}>First Name</label>
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
            className={inputCls} placeholder="Optional" disabled={loading} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Last Name</label>
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
            className={inputCls} placeholder="Optional" disabled={loading} />
        </div>
      </div>
      <div className="mb-6">
        <label className={labelCls}>Role</label>
        <select value={roleId} onChange={e => setRoleId(Number(e.target.value))}
          className={inputCls} disabled={loading}>
          {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <div className="flex gap-3">
        <button onClick={() => void submit()} disabled={loading || !email.trim() || !roleId}
          className={clsx('flex-1 py-2 rounded text-sm font-semibold font-mono transition-colors bg-accent text-background hover:bg-accent-hover',
            (loading || !email.trim() || !roleId) && 'opacity-50 cursor-not-allowed')}>
          {loading ? 'Sending…' : 'Send Invitation'}
        </button>
        <button onClick={onClose} disabled={loading}
          className="flex-1 py-2 rounded text-sm font-mono text-text-secondary border border-border hover:text-text-primary hover:border-border-focus transition-colors">
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Role modal
// ─────────────────────────────────────────────────────────────────────────────

function ChangeRoleModal({ user, roles, onClose, onUpdated }: {
  user: PlatformUser; roles: Role[]; onClose: () => void; onUpdated: () => void;
}) {
  const current = roles.find(r => r.name === user.role);
  const [roleId, setRoleId]   = useState<number>(current?.id ?? roles[0]?.id ?? 0);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(''); setLoading(true);
    try { await usersApi.update(user.id, { role_id: roleId }); onUpdated(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to update'); setLoading(false); }
  }

  return (
    <ModalShell title="Change Role" subtitle={user.email} onClose={onClose}>
      {error && <InlineError msg={error} />}
      <div className="mb-6">
        <label className={labelCls}>Role</label>
        <select value={roleId} onChange={e => setRoleId(Number(e.target.value))}
          className={inputCls} disabled={loading}>
          {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <div className="flex gap-3">
        <button onClick={() => void submit()} disabled={loading}
          className={clsx('flex-1 py-2 rounded text-sm font-semibold font-mono transition-colors bg-accent text-background hover:bg-accent-hover',
            loading && 'opacity-50 cursor-not-allowed')}>
          {loading ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} disabled={loading}
          className="flex-1 py-2 rounded text-sm font-mono text-text-secondary border border-border hover:text-text-primary hover:border-border-focus transition-colors">
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm dialog
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel, danger = false, loading = false, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string;
  danger?: boolean; loading?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <ModalShell title={title} onClose={onCancel}>
      <p className="text-sm text-text-secondary mb-6 leading-relaxed font-mono">{message}</p>
      <div className="flex gap-3">
        <button onClick={onConfirm} disabled={loading}
          className={clsx('flex-1 py-2 rounded text-sm font-semibold font-mono transition-colors',
            danger
              ? 'text-risk-critical border border-risk-critical/40 hover:bg-risk-critical-bg'
              : 'bg-accent text-background hover:bg-accent-hover',
            loading && 'opacity-50 cursor-not-allowed')}>
          {loading ? 'Working…' : confirmLabel}
        </button>
        <button onClick={onCancel} disabled={loading}
          className="flex-1 py-2 rounded text-sm font-mono text-text-secondary border border-border hover:text-text-primary hover:border-border-focus transition-colors">
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded border border-accent/50 bg-surface text-sm font-mono text-accent">
      {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'add' }
  | { type: 'changeRole'; user: PlatformUser }
  | { type: 'deactivate'; user: PlatformUser }
  | { type: 'reactivate'; user: PlatformUser }
  | { type: 'resendInvite'; user: PlatformUser };

export function UserManagementPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers]           = useState<PlatformUser[]>([]);
  const [roles, setRoles]           = useState<Role[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [modal, setModal]           = useState<ModalState>({ type: 'none' });
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast]           = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [usersRes, rolesArr] = await Promise.all([usersApi.list(), usersApi.roles()]);
      setUsers(usersRes.users ?? []);
      setRoles(rolesArr.filter(r => r.name !== 'root'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = users.filter(u => {
    if (search && !u.email.toLowerCase().includes(search.toLowerCase()) &&
        !(u.role_label ?? u.role).toLowerCase().includes(search.toLowerCase())) return false;
    if (filterRole !== 'ALL' && u.role !== filterRole) return false;
    if (filterStatus === 'ACTIVE'   && !u.is_active) return false;
    if (filterStatus === 'INACTIVE' && u.is_active) return false;
    if (filterStatus === 'PENDING'  && (u.is_enrolled || !u.is_active)) return false;
    return true;
  });

  const stats = {
    total:    users.length,
    active:   users.filter(u => u.is_active).length,
    pending:  users.filter(u => u.is_active && u.is_enrolled === false).length,
    inactive: users.filter(u => !u.is_active).length,
  };

  async function handleDeactivate(u: PlatformUser) {
    setActionLoading(true);
    try { await usersApi.deactivate(u.id); setToast(`${u.email} deactivated`); setModal({ type: 'none' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setModal({ type: 'none' }); }
    finally { setActionLoading(false); }
  }

  async function handleReactivate(u: PlatformUser) {
    setActionLoading(true);
    try { await usersApi.update(u.id, { is_active: true }); setToast(`${u.email} reactivated`); setModal({ type: 'none' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setModal({ type: 'none' }); }
    finally { setActionLoading(false); }
  }

  async function handleResendInvite(u: PlatformUser) {
    setActionLoading(true);
    try { const res = await usersApi.reissueInvite(u.id); setToast(res.message); setModal({ type: 'none' }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setModal({ type: 'none' }); }
    finally { setActionLoading(false); }
  }

  if (currentUser && currentUser.role !== 'root' && currentUser.role !== 'administrator') {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-text-primary text-sm mb-1 font-mono">Access Denied</p>
          <p className="text-text-muted text-sm font-mono">Requires Administrator or Root role.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">

      {/* Header — matches Cockpit h1/p pattern */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">User Management</h1>
          <p className="text-text-secondary">Platform access — invite, assign roles, deactivate</p>
        </div>
        <div className="flex items-center gap-6 text-sm font-mono">
          <div><span className="text-text-muted">Total:</span><span className="ml-1.5 text-text-primary">{stats.total}</span></div>
          <div className="w-px h-4 bg-border" />
          <div><span className="text-text-muted">Active:</span><span className="ml-1.5 text-pnl-positive">{stats.active}</span></div>
          <div><span className="text-text-muted">Pending:</span><span className="ml-1.5 text-risk-medium">{stats.pending}</span></div>
          <div><span className="text-text-muted">Inactive:</span><span className="ml-1.5 text-text-muted">{stats.inactive}</span></div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 border-b border-risk-critical bg-risk-critical-bg text-sm text-risk-critical flex items-center justify-between shrink-0 font-mono">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-4 underline hover:no-underline">Dismiss</button>
        </div>
      )}

      {/* Filter bar */}
      <div className="px-6 py-2 border-b border-border-muted flex items-center gap-4 shrink-0 bg-surface">
        <span className="text-xs text-text-muted uppercase tracking-wider font-mono">Filters</span>

        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search email or role…"
          className="w-64 bg-background border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent font-mono transition-colors" />

        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="bg-background border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent font-mono transition-colors">
          <option value="ALL">All Roles</option>
          {[...new Set(users.map(u => u.role))].map(r => (
            <option key={r} value={r}>{users.find(u => u.role === r)?.role_label ?? r}</option>
          ))}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-background border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent font-mono transition-colors">
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PENDING">Pending Enrollment</option>
        </select>

        <div className="ml-auto">
          <button onClick={() => setModal({ type: 'add' })}
            className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-semibold font-mono bg-accent text-background hover:bg-accent-hover transition-colors">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M9,12A6,6,0,1,0,3,6,6.006,6.006,0,0,0,9,12ZM9,2A4,4,0,1,1,5,6,4,4,0,0,1,9,2Z"/>
              <polygon points="21 10 21 7 19 7 19 10 16 10 16 12 19 12 19 15 21 15 21 12 24 12 24 10 21 10"/>
              <path d="M13.043,14H4.957A4.963,4.963,0,0,0,0,18.957V24H2V18.957A2.96,2.96,0,0,1,4.957,16h8.086A2.96,2.96,0,0,1,16,18.957V24h2V18.957A4.963,4.963,0,0,0,13.043,14Z"/>
            </svg>
            Add User
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-text-muted font-mono">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-text-muted font-mono">
            {users.length === 0 ? 'No users found.' : 'No users match the current filters.'}
          </div>
        ) : (
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="border-b border-border bg-surface">
                {['Email', 'Role', 'Status', 'Enrollment', 'Joined', 'Actions'].map((h, i) => (
                  <th key={h} className={clsx(
                    'px-6 py-3 text-xs font-medium font-mono text-text-muted uppercase tracking-wider',
                    i === 5 ? 'text-right' : 'text-left'
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b border-border-muted hover:bg-surface transition-colors">
                  <td className="px-6 py-3 text-sm text-text-primary font-mono">{u.email}</td>
                  <td className="px-6 py-3 text-sm text-text-secondary font-mono">{u.role_label ?? u.role}</td>
                  <td className="px-6 py-3"><ActiveBadge active={u.is_active} /></td>
                  <td className="px-6 py-3"><EnrollmentBadge user={u} /></td>
                  <td className="px-6 py-3 text-sm text-text-muted font-mono">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {u.role !== 'root' && u.is_active && (
                        <button onClick={() => setModal({ type: 'changeRole', user: u })}
                          className="px-2.5 py-1 rounded text-xs font-mono text-text-secondary border border-border hover:text-accent hover:border-accent transition-colors">
                          Role
                        </button>
                      )}
                      {u.role !== 'root' && u.is_active && (
                        <button onClick={() => setModal({ type: 'resendInvite', user: u })}
                          className="px-2.5 py-1 rounded text-xs font-mono text-risk-medium border border-risk-medium-border/50 hover:bg-risk-medium-bg transition-colors">
                          {u.is_enrolled ? 'Reset Access' : 'Resend Invite'}
                        </button>
                      )}
                      {u.role !== 'root' && u.id !== currentUser?.id && (
                        u.is_active ? (
                          <button onClick={() => setModal({ type: 'deactivate', user: u })}
                            className="px-2.5 py-1 rounded text-xs font-mono text-risk-critical border border-risk-critical/30 hover:bg-risk-critical-bg transition-colors">
                            Deactivate
                          </button>
                        ) : (
                          <button onClick={() => setModal({ type: 'reactivate', user: u })}
                            className="px-2.5 py-1 rounded text-xs font-mono text-pnl-positive border border-risk-low/30 hover:bg-risk-low-bg transition-colors">
                            Reactivate
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer row count */}
      {!loading && filtered.length > 0 && (
        <div className="px-6 py-2 border-t border-border-muted bg-surface shrink-0">
          <span className="text-xs text-text-muted font-mono">
            {filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Modals */}
      {modal.type === 'add' && (
        <AddUserModal roles={roles} onClose={() => setModal({ type: 'none' })}
          onCreated={msg => { setToast(msg); setModal({ type: 'none' }); void load(); }} />
      )}
      {modal.type === 'changeRole' && (
        <ChangeRoleModal user={modal.user} roles={roles} onClose={() => setModal({ type: 'none' })}
          onUpdated={() => { setToast(`Role updated for ${modal.user.email}`); setModal({ type: 'none' }); void load(); }} />
      )}
      {modal.type === 'deactivate' && (
        <ConfirmDialog title="Deactivate User"
          message={`Deactivate ${modal.user.email}? Their sessions will be revoked immediately. The account can be reactivated later.`}
          confirmLabel="Deactivate" danger loading={actionLoading}
          onConfirm={() => void handleDeactivate(modal.user)} onCancel={() => setModal({ type: 'none' })} />
      )}
      {modal.type === 'reactivate' && (
        <ConfirmDialog title="Reactivate User"
          message={`Reactivate ${modal.user.email}? They will be able to sign in again.`}
          confirmLabel="Reactivate" loading={actionLoading}
          onConfirm={() => void handleReactivate(modal.user)} onCancel={() => setModal({ type: 'none' })} />
      )}
      {modal.type === 'resendInvite' && (
        <ConfirmDialog title="Resend Invitation"
          message={`${'is_enrolled' in modal.user && modal.user.is_enrolled ? 'Reset access for' : 'Resend the setup invitation to'} ${modal.user.email}? This will invalidate any previous invite and trigger a full re-enrollment (password + TOTP).`}
          confirmLabel="Resend" loading={actionLoading}
          onConfirm={() => void handleResendInvite(modal.user)} onCancel={() => setModal({ type: 'none' })} />
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}
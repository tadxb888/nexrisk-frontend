// ============================================
// Alerting — settings sub-page
// Route: /settings/alerting
//
// Three subsections on one page, each independently saveable:
//   1. Alerts core  — global policy (§ 3.2: min severity, cooldown, rate cap)
//   2. Telegram     — core config (bot token) + chat CRUD + live probes (§§ 3.2, 4)
//   3. Webhooks     — core config (enable) + endpoint CRUD + test probe (§§ 3.2, 5)
//
// Design decisions:
//   - Single column, three stacked cards. Each card has its own save/revert.
//   - CRUD actions (add/edit/delete chat or endpoint) fire immediately;
//     no batch. Simpler mental model than dragging rows into a dirty state.
//   - Live probes (validate, resolve-chat, test, webhook test) return 501
//     today; UI renders "not implemented yet" badges via fetchWithStub's
//     discriminated ApiResult.
//   - bot_token follows the same write-preserve pattern as other secrets
//     (Gateway password, NexDay license, TE api_key).
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';

// Help content for the operator manual — rendered in the help drawer
import helpContent from './help/09-alerting.md?raw';
import { HelpIcon, HelpDrawer, useHelp } from './help';
import {
  settingsApi,
  ALERT_SEVERITIES,
  type AlertSeverity,
  type AlertsConfig,
  type TelegramConfig,
  type TelegramChat,
  type TelegramChatCreateBody,
  type TelegramChatUpdateBody,
  type TelegramValidateResponse,
  type TelegramResolveResponse,
  type TelegramTestResponse,
  type WebhooksConfig,
  type WebhookEndpoint,
  type WebhookEndpointCreateBody,
  type WebhookEndpointUpdateBody,
  type WebhookTestResponse,
  type NexriskConfig,
  type ApiResult,
} from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Access control
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function AlertingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const help = useHelp();

  const [nexrisk,   setNexrisk]   = useState<NexriskConfig | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function reload() {
    const n = await settingsApi.nexrisk.get();
    setNexrisk(n);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    settingsApi.nexrisk.get()
      .then(n => { if (!cancelled) setNexrisk(n); })
      .catch(err => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load nexrisk config');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <span>Alerting</span>
      </div>

      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            Alerting
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Global alert policy, Telegram delivery, and webhook delivery. The three
            subsections below share one config file
            (<span className="font-mono text-text-secondary">nexrisk_config.json</span>)
            but save independently.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="shrink-0 font-mono text-xs px-2.5 py-1 rounded"
            style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
          >
            restart: nexrisk_service
          </span>
          <HelpIcon onClick={help.open} />
        </div>
      </div>

      {loadError ? (
        <div className="rounded p-3 mb-4" style={{ background: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}>
          <p className="text-sm font-medium m-0">Failed to load config</p>
          <p className="text-xs mt-1 text-text-secondary">{loadError}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <AlertsCoreCard loading={loading} initial={nexrisk?.alerts} onSaved={reload} />
        <TelegramCard   loading={loading} initial={nexrisk?.telegram} onSaved={reload} />
        <WebhooksCard   loading={loading} initial={nexrisk?.webhooks} onSaved={reload} />
      </div>

    <HelpDrawer
      open={help.isOpen}
      title="Alerting"
      content={helpContent}
      onClose={help.close}
    />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 1 — Alerts core
// ─────────────────────────────────────────────────────────────────────────────

function AlertsCoreCard({
  loading, initial, onSaved,
}: {
  loading: boolean; initial?: AlertsConfig; onSaved: () => Promise<void>;
}) {
  interface Draft {
    enabled: boolean;
    min_severity: AlertSeverity;
    cooldown_seconds: string;
    max_per_trader_per_hour: string;
  }

  const emptyDraft: Draft = {
    enabled: false, min_severity: 'HIGH',
    cooldown_seconds: '', max_per_trader_per_hour: '',
  };

  const [draft,        setDraft]        = useState<Draft>(emptyDraft);
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setDraft({
        enabled:                 initial.enabled ?? false,
        min_severity:            initial.min_severity ?? 'HIGH',
        cooldown_seconds:        String(initial.cooldown_seconds ?? ''),
        max_per_trader_per_hour: String(initial.max_per_trader_per_hour ?? ''),
      });
    }
  }, [initial]);

  const dirty = useMemo(() => {
    if (!initial) return false;
    if (draft.enabled !== (initial.enabled ?? false)) return true;
    if (draft.min_severity !== (initial.min_severity ?? 'HIGH')) return true;
    if (draft.cooldown_seconds !== String(initial.cooldown_seconds ?? '')) return true;
    if (draft.max_per_trader_per_hour !== String(initial.max_per_trader_per_hour ?? '')) return true;
    return false;
  }, [draft, initial]);

  function handleRevert() {
    if (!initial) return;
    setDraft({
      enabled: initial.enabled ?? false,
      min_severity: initial.min_severity ?? 'HIGH',
      cooldown_seconds: String(initial.cooldown_seconds ?? ''),
      max_per_trader_per_hour: String(initial.max_per_trader_per_hour ?? ''),
    });
    setSaveError(null);
    setSavedMessage(null);
  }

  async function handleSave() {
    if (!initial || !dirty || saving) return;
    const cooldown = Number(draft.cooldown_seconds);
    const maxRate = Number(draft.max_per_trader_per_hour);
    if (draft.cooldown_seconds === '' || !Number.isInteger(cooldown) || cooldown < 0) {
      setSaveError('Cooldown must be a non-negative integer'); return;
    }
    if (draft.max_per_trader_per_hour === '' || !Number.isInteger(maxRate) || maxRate < 0) {
      setSaveError('Rate cap must be a non-negative integer'); return;
    }

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const res = await settingsApi.nexrisk.updateAlerts({
        enabled:                 draft.enabled,
        min_severity:            draft.min_severity,
        cooldown_seconds:        cooldown,
        max_per_trader_per_hour: maxRate,
      });
      await onSaved();
      setSavedMessage(res.pending_restart
        ? (res.restart_notice ?? 'Saved. Restart nexrisk_service to apply.')
        : 'Saved.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
        <h2 className="text-base font-medium text-text-primary m-0">Alerts — core policy</h2>
        <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
          Master switch, severity floor, and rate caps. Applies to all delivery channels.
        </p>
      </div>
      <div className="px-5 pt-4 pb-1 grid grid-cols-1 md:grid-cols-2 gap-x-5">
        <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5 border-b border-[#2a292c] md:col-span-2">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-text-secondary">Alerts enabled</div>
            <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
              Master switch. When off, no alerts are sent regardless of channel config.
            </div>
          </div>
          <Toggle on={draft.enabled} onChange={v => { setDraft(d => ({ ...d, enabled: v })); setSaveError(null); setSavedMessage(null); }} disabled={loading} />
        </div>
        <SelectField
          label="Minimum severity"
          value={draft.min_severity}
          options={ALERT_SEVERITIES}
          onChange={v => { setDraft(d => ({ ...d, min_severity: v as AlertSeverity })); setSaveError(null); setSavedMessage(null); }}
          helper="Alerts below this level never leave nexrisk_service."
          disabled={loading}
        />
        <ScalarField
          label="Cooldown (seconds)"
          value={draft.cooldown_seconds}
          onChange={v => { setDraft(d => ({ ...d, cooldown_seconds: v })); setSaveError(null); setSavedMessage(null); }}
          placeholder={loading ? 'Loading…' : '300'}
          helper="Minimum seconds between two alerts of the same kind for the same trader."
          disabled={loading}
        />
        <ScalarField
          label="Max per trader per hour"
          value={draft.max_per_trader_per_hour}
          onChange={v => { setDraft(d => ({ ...d, max_per_trader_per_hour: v })); setSaveError(null); setSavedMessage(null); }}
          placeholder={loading ? 'Loading…' : '12'}
          helper="Rate cap. Anything beyond is dropped on the floor."
          disabled={loading}
        />
      </div>
      {(saveError || savedMessage) && (
        <div className="px-5 py-2">
          {saveError && <p className="text-xs m-0" style={{ color: '#ff5c5c' }}>{saveError}</p>}
          {savedMessage && !saveError && <p className="text-xs m-0" style={{ color: '#66e07a' }}>{savedMessage}</p>}
        </div>
      )}
      <SaveBar dirty={dirty} saving={saving} loading={loading} onSave={handleSave} onRevert={handleRevert} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 2 — Telegram
// ─────────────────────────────────────────────────────────────────────────────

function TelegramCard({
  loading, initial, onSaved,
}: {
  loading: boolean; initial?: TelegramConfig; onSaved: () => Promise<void>;
}) {
  const [enabled,       setEnabled]       = useState(false);
  const [botTokenInput, setBotTokenInput] = useState('');  // blank means unchanged

  const [coreSaving,    setCoreSaving]    = useState(false);
  const [coreError,     setCoreError]     = useState<string | null>(null);
  const [coreMessage,   setCoreMessage]   = useState<string | null>(null);

  const [validateResult, setValidateResult] = useState<ApiResult<TelegramValidateResponse> | null>(null);
  const [validating,     setValidating]     = useState(false);

  const [chats,    setChats]    = useState<TelegramChat[]>([]);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [addingChat, setAddingChat] = useState(false);

  useEffect(() => {
    if (initial) {
      setEnabled(initial.enabled ?? false);
      setChats(initial.chats ?? []);
      setValidateResult(null);
    }
  }, [initial]);

  const coreDirty = initial
    ? (enabled !== (initial.enabled ?? false)) || botTokenInput !== ''
    : false;

  async function handleCoreSave() {
    if (!coreDirty || coreSaving) return;
    setCoreSaving(true);
    setCoreError(null);
    setCoreMessage(null);
    try {
      const body: { enabled: boolean; bot_token?: string } = { enabled };
      if (botTokenInput !== '') body.bot_token = botTokenInput;
      const res = await settingsApi.nexrisk.updateTelegram(body);
      await onSaved();
      setBotTokenInput('');
      setCoreMessage(res.pending_restart
        ? (res.restart_notice ?? 'Saved. Restart nexrisk_service to apply.')
        : 'Saved.');
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setCoreSaving(false);
    }
  }

  async function handleValidate() {
    if (botTokenInput === '' || validating) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const r = await settingsApi.telegram.validate(botTokenInput);
      setValidateResult(r);
    } catch (err) {
      setValidateResult({ kind: 'error', status: 0, message: err instanceof Error ? err.message : 'Validate failed' });
    } finally {
      setValidating(false);
    }
  }

  async function handleAddChat(body: TelegramChatCreateBody): Promise<string | null> {
    try {
      const r = await settingsApi.telegram.addChat(body);
      setChats(c => [...c, r.chat]);
      await onSaved();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Add failed';
    }
  }

  async function handleUpdateChat(id: string, patch: TelegramChatUpdateBody): Promise<string | null> {
    try {
      await settingsApi.telegram.updateChat(id, patch);
      setChats(c => c.map(x => x.id === id ? { ...x, ...patch } as TelegramChat : x));
      await onSaved();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Update failed';
    }
  }

  async function handleDeleteChat(id: string): Promise<string | null> {
    try {
      await settingsApi.telegram.deleteChat(id);
      setChats(c => c.filter(x => x.id !== id));
      await onSaved();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Delete failed';
    }
  }

  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
        <h2 className="text-base font-medium text-text-primary m-0">Telegram</h2>
        <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
          Bot token, chat list, and live probes. Sending a test message posts to the
          actual chat.
        </p>
      </div>

      {/* Core config */}
      <div className="px-5 pt-4 pb-1 grid grid-cols-1 md:grid-cols-2 gap-x-5">
        <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5 border-b border-[#2a292c] md:col-span-2">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-text-secondary">Telegram delivery</div>
            <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
              Per-channel switch. Alerts still need the master switch enabled too.
            </div>
          </div>
          <Toggle on={enabled} onChange={v => { setEnabled(v); setCoreError(null); setCoreMessage(null); }} disabled={loading} />
        </div>

        <div className="flex flex-col gap-1.5 mb-3.5 md:col-span-2">
          <label className="text-[13px] font-medium text-text-secondary flex items-center gap-2">
            Bot token
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded tracking-wide"
              style={{ background: '#163a3a', color: '#49b3b3', border: '1px solid #2f8f8f' }}
            >
              secret
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={botTokenInput}
              onChange={e => { setBotTokenInput(e.target.value); setCoreError(null); setCoreMessage(null); setValidateResult(null); }}
              placeholder="Leave blank to keep current value"
              disabled={loading}
              className="flex-1 rounded px-3 py-1.5 text-[13px] font-mono text-text-primary min-h-[34px] border focus:outline-none focus:border-accent"
              style={{ background: '#232225', borderColor: '#44454f' }}
            />
            <button
              type="button"
              onClick={handleValidate}
              disabled={botTokenInput === '' || validating || loading}
              className={clsx(
                'px-3 py-1.5 rounded border text-[13px] font-medium',
                'bg-transparent border-border text-text-secondary',
                botTokenInput === '' || validating || loading
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-surface-hover cursor-pointer',
              )}
            >
              {validating ? 'Validating…' : 'Validate'}
            </button>
          </div>
          <span className="text-[11.5px] text-text-muted leading-snug">
            Stored encrypted. Current value is masked on read — blank means unchanged.
            Validate contacts Telegram's API to verify the token works.
          </span>
          <ValidateResultBanner result={validateResult} />
        </div>
      </div>

      {(coreError || coreMessage) && (
        <div className="px-5 py-2">
          {coreError && <p className="text-xs m-0" style={{ color: '#ff5c5c' }}>{coreError}</p>}
          {coreMessage && !coreError && <p className="text-xs m-0" style={{ color: '#66e07a' }}>{coreMessage}</p>}
        </div>
      )}

      <SaveBar
        dirty={coreDirty}
        saving={coreSaving}
        loading={loading}
        onSave={handleCoreSave}
        onRevert={() => { setEnabled(initial?.enabled ?? false); setBotTokenInput(''); setCoreError(null); setCoreMessage(null); }}
        label="Save core"
      />

      {/* Chat list */}
      <div className="border-t border-border">
        <div className="px-5 py-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary m-0">Chats</h3>
            <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
              {chats.length === 0 ? 'No chats yet. Add one to start routing alerts.' :
                `${chats.length} chat${chats.length === 1 ? '' : 's'} configured.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddingChat(true)}
            disabled={addingChat || loading}
            className={clsx(
              'px-3 py-1.5 rounded border text-[13px] font-medium',
              'bg-transparent border-border text-text-secondary',
              addingChat || loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-hover cursor-pointer',
            )}
          >
            + Add chat
          </button>
        </div>

        {addingChat && (
          <div className="px-5 pb-3">
            <ChatForm
              onSubmit={async body => {
                const err = await handleAddChat(body);
                if (err) return err;
                setAddingChat(false);
                return null;
              }}
              onCancel={() => setAddingChat(false)}
              submitLabel="Add chat"
            />
          </div>
        )}

        {chatsError && <p className="px-5 pb-2 text-xs m-0" style={{ color: '#ff5c5c' }}>{chatsError}</p>}

        {chats.length > 0 && (
          <ul className="m-0 p-0 list-none">
            {chats.map((chat, idx) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                isFirst={idx === 0}
                onUpdate={patch => handleUpdateChat(chat.id, patch)}
                onDelete={() => handleDeleteChat(chat.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ValidateResultBanner({ result }: { result: ApiResult<TelegramValidateResponse> | null }) {
  if (!result) return null;
  if (result.kind === 'not_implemented') {
    return (
      <div className="rounded p-2.5 mt-1" style={{ background: '#18202a', border: '1px solid #2b3e57' }}>
        <p className="text-[11.5px] m-0" style={{ color: '#5b86b8' }}>
          Validate endpoint is 501 — not implemented in the backend yet.
        </p>
      </div>
    );
  }
  if (result.kind === 'error') {
    return (
      <div className="rounded p-2.5 mt-1" style={{ background: '#2c1417', border: '1px solid #7a2f36' }}>
        <p className="text-[11.5px] m-0" style={{ color: '#ff5c5c' }}>{result.message}</p>
      </div>
    );
  }
  const { ok, bot_username, bot_id } = result.data;
  return (
    <div className="rounded p-2.5 mt-1" style={{ background: '#162a1c', border: '1px solid #2f6a3f' }}>
      <p className="text-[11.5px] m-0" style={{ color: '#66e07a' }}>
        {ok ? (
          <>Token valid · <span className="font-mono">@{bot_username}</span>{bot_id ? <> · id {bot_id}</> : null}</>
        ) : (
          'Token rejected by Telegram.'
        )}
      </p>
    </div>
  );
}

interface ChatRowProps {
  chat:     TelegramChat;
  isFirst:  boolean;
  onUpdate: (patch: TelegramChatUpdateBody) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
}

function ChatRow({ chat, isFirst, onUpdate, onDelete }: ChatRowProps) {
  const [editing,       setEditing]       = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [rowError,      setRowError]      = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [testResult, setTestResult] = useState<ApiResult<TelegramTestResponse> | null>(null);
  const [testing,    setTesting]    = useState(false);

  async function doTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = `NexRisk test message — ${new Date().toISOString()}`;
      const r = await settingsApi.telegram.test(chat.chat_id, msg);
      setTestResult(r);
    } catch (err) {
      setTestResult({ kind: 'error', status: 0, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    const err = await onDelete();
    if (err) {
      setRowError(err);
      setDeleting(false);
      setConfirmDelete(false);
    }
    // on success, the row unmounts
  }

  return (
    <li
      className="px-5 py-3"
      style={{ borderTop: isFirst ? '1px solid #2a292c' : '1px solid #2a292c' }}
    >
      {editing ? (
        <ChatForm
          initial={chat}
          onSubmit={async patch => {
            const err = await onUpdate(patch);
            if (err) return err;
            setEditing(false);
            return null;
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save chat"
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-medium text-text-primary truncate">{chat.label}</span>
                <span className="font-mono text-[11px] text-text-muted">{chat.chat_id}</span>
              </div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {chat.alert_levels.map(lvl => <SeverityBadge key={lvl} level={lvl} />)}
              </div>
              <p className="text-[10.5px] text-text-muted font-mono mt-0.5 m-0">id {chat.id}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={doTest}
                disabled={testing}
                className={clsx(
                  'px-2.5 py-1 rounded border text-[11.5px] font-medium',
                  'bg-transparent border-border text-text-secondary',
                  testing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-hover cursor-pointer',
                )}
              >
                {testing ? 'Testing…' : 'Test'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-2.5 py-1 rounded border text-[11.5px] font-medium bg-transparent border-border text-text-secondary hover:bg-surface-hover cursor-pointer"
              >
                Edit
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(true); setRowError(null); }}
                  className="px-2.5 py-1 rounded border text-[11.5px] font-medium cursor-pointer"
                  style={{ background: 'transparent', borderColor: '#7a2f36', color: '#ff9999' }}
                >
                  Delete
                </button>
              ) : (
                <>
                  <span className="text-[11.5px] text-text-muted">Confirm?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="px-2.5 py-1 rounded border border-border text-[11.5px] text-text-secondary hover:bg-surface-hover cursor-pointer"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={doDelete}
                    disabled={deleting}
                    className={clsx(
                      'px-2.5 py-1 rounded border text-[11.5px] font-medium',
                      deleting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    )}
                    style={{ background: '#2c1417', borderColor: '#7a2f36', color: '#ff9999' }}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                </>
              )}
            </div>
          </div>
          {testResult && <TestResultBanner result={testResult} labelOk="Message sent" />}
          {rowError && (
            <div className="rounded p-2 mt-1.5" style={{ background: '#2c1417', border: '1px solid #7a2f36' }}>
              <p className="text-[11.5px] m-0" style={{ color: '#ff5c5c' }}>{rowError}</p>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function ChatForm({
  initial, onSubmit, onCancel, submitLabel,
}: {
  initial?: TelegramChat;
  onSubmit: (body: TelegramChatCreateBody) => Promise<string | null>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [label,        setLabel]        = useState(initial?.label ?? '');
  const [chatId,       setChatId]       = useState(initial?.chat_id ?? '');
  const [alertLevels,  setAlertLevels]  = useState<AlertSeverity[]>(initial?.alert_levels ?? ['HIGH', 'CRITICAL']);
  const [handle,       setHandle]       = useState('');

  const [resolving,    setResolving]    = useState(false);
  const [resolveResult, setResolveResult] = useState<ApiResult<TelegramResolveResponse> | null>(null);

  const [submitting,   setSubmitting]   = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);

  async function doResolve() {
    if (handle.trim() === '' || resolving) return;
    setResolving(true);
    setResolveResult(null);
    try {
      const r = await settingsApi.telegram.resolveChat(handle.trim());
      setResolveResult(r);
      if (r.kind === 'ok') {
        setChatId(r.data.chat_id);
        if (label === '' && r.data.title) setLabel(r.data.title);
      }
    } catch (err) {
      setResolveResult({ kind: 'error', status: 0, message: err instanceof Error ? err.message : 'Resolve failed' });
    } finally {
      setResolving(false);
    }
  }

  async function doSubmit() {
    if (submitting) return;
    if (label.trim() === '' || chatId.trim() === '' || alertLevels.length === 0) {
      setFormError('Label, chat ID, and at least one alert level are required.'); return;
    }
    setSubmitting(true);
    setFormError(null);
    const err = await onSubmit({
      label:        label.trim(),
      chat_id:      chatId.trim(),
      alert_levels: alertLevels,
    });
    if (err) setFormError(err);
    setSubmitting(false);
  }

  return (
    <div
      className="rounded p-3.5 flex flex-col gap-3"
      style={{ background: '#232225', border: '1px solid #2a292c' }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-medium text-text-secondary">Label</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Ops Room"
            className="rounded px-2.5 py-1.5 text-[13px] text-text-primary min-h-[34px] border focus:outline-none focus:border-accent"
            style={{ background: '#1a1a1d', borderColor: '#44454f' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-medium text-text-secondary">Telegram chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="-1001234567890"
            className="rounded px-2.5 py-1.5 text-[13px] font-mono text-text-primary min-h-[34px] border focus:outline-none focus:border-accent"
            style={{ background: '#1a1a1d', borderColor: '#44454f' }}
          />
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium text-text-secondary block mb-1">
          Don't know the numeric ID? Resolve a handle or link:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder="@myroom or https://t.me/myroom"
            className="flex-1 rounded px-2.5 py-1.5 text-[13px] font-mono text-text-primary min-h-[34px] border focus:outline-none focus:border-accent"
            style={{ background: '#1a1a1d', borderColor: '#44454f' }}
          />
          <button
            type="button"
            onClick={doResolve}
            disabled={handle.trim() === '' || resolving}
            className={clsx(
              'px-3 py-1 rounded border text-[12.5px] font-medium shrink-0',
              'bg-transparent border-border text-text-secondary',
              handle.trim() === '' || resolving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-hover cursor-pointer',
            )}
          >
            {resolving ? 'Resolving…' : 'Resolve'}
          </button>
        </div>
        {resolveResult && (
          resolveResult.kind === 'not_implemented' ? (
            <div className="rounded p-2 mt-1" style={{ background: '#18202a', border: '1px solid #2b3e57' }}>
              <p className="text-[11.5px] m-0" style={{ color: '#5b86b8' }}>
                Resolve endpoint is 501 — not implemented yet.
              </p>
            </div>
          ) : resolveResult.kind === 'error' ? (
            <div className="rounded p-2 mt-1" style={{ background: '#2c1417', border: '1px solid #7a2f36' }}>
              <p className="text-[11.5px] m-0" style={{ color: '#ff5c5c' }}>{resolveResult.message}</p>
            </div>
          ) : (
            <div className="rounded p-2 mt-1" style={{ background: '#162a1c', border: '1px solid #2f6a3f' }}>
              <p className="text-[11.5px] m-0" style={{ color: '#66e07a' }}>
                Resolved to <span className="font-mono">{resolveResult.data.chat_id}</span> — {resolveResult.data.title} ({resolveResult.data.type})
              </p>
            </div>
          )
        )}
      </div>

      <div>
        <label className="text-[12px] font-medium text-text-secondary block mb-1.5">Alert levels</label>
        <SeverityPicker selected={alertLevels} onChange={setAlertLevels} />
      </div>

      {formError && (
        <div className="rounded p-2" style={{ background: '#2c1417', border: '1px solid #7a2f36' }}>
          <p className="text-[11.5px] m-0" style={{ color: '#ff5c5c' }}>{formError}</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1 rounded border border-border text-[12.5px] text-text-secondary hover:bg-surface-hover cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={doSubmit}
          disabled={submitting}
          className={clsx(
            'px-3 py-1 rounded border text-[12.5px] font-medium',
            'bg-accent border-accent text-[#0b0c0e]',
            submitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent-hover cursor-pointer',
          )}
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 3 — Webhooks
// ─────────────────────────────────────────────────────────────────────────────

function WebhooksCard({
  loading, initial, onSaved,
}: {
  loading: boolean; initial?: WebhooksConfig; onSaved: () => Promise<void>;
}) {
  const [enabled,      setEnabled]      = useState(false);
  const [coreSaving,   setCoreSaving]   = useState(false);
  const [coreError,    setCoreError]    = useState<string | null>(null);
  const [coreMessage,  setCoreMessage]  = useState<string | null>(null);

  const [endpoints,    setEndpoints]    = useState<WebhookEndpoint[]>([]);
  const [addingEp,     setAddingEp]     = useState(false);

  useEffect(() => {
    if (initial) {
      setEnabled(initial.enabled ?? false);
      setEndpoints(initial.endpoints ?? []);
    }
  }, [initial]);

  const coreDirty = initial ? enabled !== (initial.enabled ?? false) : false;

  async function handleCoreSave() {
    if (!coreDirty || coreSaving) return;
    setCoreSaving(true);
    setCoreError(null);
    setCoreMessage(null);
    try {
      const res = await settingsApi.nexrisk.updateWebhooks({ enabled });
      await onSaved();
      setCoreMessage(res.pending_restart
        ? (res.restart_notice ?? 'Saved. Restart nexrisk_service to apply.')
        : 'Saved.');
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setCoreSaving(false);
    }
  }

  async function handleAdd(body: WebhookEndpointCreateBody): Promise<string | null> {
    try {
      const r = await settingsApi.webhooks.addEndpoint(body);
      setEndpoints(e => [...e, r.webhook]);
      await onSaved();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Add failed';
    }
  }

  async function handleUpdate(id: string, patch: WebhookEndpointUpdateBody): Promise<string | null> {
    try {
      await settingsApi.webhooks.updateEndpoint(id, patch);
      setEndpoints(e => e.map(x => x.id === id ? { ...x, ...patch } as WebhookEndpoint : x));
      await onSaved();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Update failed';
    }
  }

  async function handleDelete(id: string): Promise<string | null> {
    try {
      await settingsApi.webhooks.deleteEndpoint(id);
      setEndpoints(e => e.filter(x => x.id !== id));
      await onSaved();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Delete failed';
    }
  }

  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
        <h2 className="text-base font-medium text-text-primary m-0">Webhooks</h2>
        <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
          HTTP endpoints that receive alert POSTs. The test button fires a real
          request and shows the response status.
        </p>
      </div>

      {/* Core */}
      <div className="px-5 pt-4 pb-1">
        <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5 border-b border-[#2a292c]">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-text-secondary">Webhook delivery</div>
            <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
              Per-channel switch. Alerts still need the master switch enabled too.
            </div>
          </div>
          <Toggle on={enabled} onChange={v => { setEnabled(v); setCoreError(null); setCoreMessage(null); }} disabled={loading} />
        </div>
      </div>

      {(coreError || coreMessage) && (
        <div className="px-5 py-2">
          {coreError && <p className="text-xs m-0" style={{ color: '#ff5c5c' }}>{coreError}</p>}
          {coreMessage && !coreError && <p className="text-xs m-0" style={{ color: '#66e07a' }}>{coreMessage}</p>}
        </div>
      )}

      <SaveBar
        dirty={coreDirty}
        saving={coreSaving}
        loading={loading}
        onSave={handleCoreSave}
        onRevert={() => { setEnabled(initial?.enabled ?? false); setCoreError(null); setCoreMessage(null); }}
        label="Save core"
      />

      {/* Endpoints */}
      <div className="border-t border-border">
        <div className="px-5 py-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary m-0">Endpoints</h3>
            <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
              {endpoints.length === 0 ? 'No endpoints configured.' :
                `${endpoints.length} endpoint${endpoints.length === 1 ? '' : 's'}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddingEp(true)}
            disabled={addingEp || loading}
            className={clsx(
              'px-3 py-1.5 rounded border text-[13px] font-medium',
              'bg-transparent border-border text-text-secondary',
              addingEp || loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-hover cursor-pointer',
            )}
          >
            + Add endpoint
          </button>
        </div>

        {addingEp && (
          <div className="px-5 pb-3">
            <EndpointForm
              onSubmit={async body => {
                const err = await handleAdd(body);
                if (err) return err;
                setAddingEp(false);
                return null;
              }}
              onCancel={() => setAddingEp(false)}
              submitLabel="Add endpoint"
            />
          </div>
        )}

        {endpoints.length > 0 && (
          <ul className="m-0 p-0 list-none">
            {endpoints.map((ep, idx) => (
              <EndpointRow
                key={ep.id}
                endpoint={ep}
                isFirst={idx === 0}
                onUpdate={patch => handleUpdate(ep.id, patch)}
                onDelete={() => handleDelete(ep.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EndpointRow({
  endpoint, isFirst, onUpdate, onDelete,
}: {
  endpoint: WebhookEndpoint;
  isFirst:  boolean;
  onUpdate: (patch: WebhookEndpointUpdateBody) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
}) {
  const [editing,       setEditing]       = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rowError,      setRowError]      = useState<string | null>(null);

  const [testResult, setTestResult] = useState<ApiResult<WebhookTestResponse> | null>(null);
  const [testing,    setTesting]    = useState(false);

  async function doTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await settingsApi.webhooks.testEndpoint(endpoint.id);
      setTestResult(r);
    } catch (err) {
      setTestResult({ kind: 'error', status: 0, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    const err = await onDelete();
    if (err) {
      setRowError(err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <li className="px-5 py-3" style={{ borderTop: isFirst ? '1px solid #2a292c' : '1px solid #2a292c' }}>
      {editing ? (
        <EndpointForm
          initial={endpoint}
          onSubmit={async patch => {
            const err = await onUpdate(patch);
            if (err) return err;
            setEditing(false);
            return null;
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save endpoint"
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12.5px] text-text-primary truncate" style={{ maxWidth: 460 }}>
                  {endpoint.url}
                </span>
                {!endpoint.enabled && (
                  <span
                    className="text-[10.5px] font-mono uppercase px-1.5 py-0.5 rounded tracking-wide"
                    style={{ background: '#1a1a1d', color: '#b6babf', border: '1px solid #44454f' }}
                  >
                    disabled
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {endpoint.alert_levels.map(lvl => <SeverityBadge key={lvl} level={lvl} />)}
              </div>
              <p className="text-[10.5px] text-text-muted font-mono mt-0.5 m-0">
                id {endpoint.id}{endpoint.auth_header ? ' · auth header present' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={doTest}
                disabled={testing}
                className={clsx(
                  'px-2.5 py-1 rounded border text-[11.5px] font-medium',
                  'bg-transparent border-border text-text-secondary',
                  testing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-hover cursor-pointer',
                )}
              >
                {testing ? 'Testing…' : 'Test'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-2.5 py-1 rounded border border-border text-[11.5px] font-medium bg-transparent text-text-secondary hover:bg-surface-hover cursor-pointer"
              >
                Edit
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(true); setRowError(null); }}
                  className="px-2.5 py-1 rounded border text-[11.5px] font-medium cursor-pointer"
                  style={{ background: 'transparent', borderColor: '#7a2f36', color: '#ff9999' }}
                >
                  Delete
                </button>
              ) : (
                <>
                  <span className="text-[11.5px] text-text-muted">Confirm?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="px-2.5 py-1 rounded border border-border text-[11.5px] text-text-secondary hover:bg-surface-hover cursor-pointer"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={doDelete}
                    disabled={deleting}
                    className={clsx(
                      'px-2.5 py-1 rounded border text-[11.5px] font-medium',
                      deleting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    )}
                    style={{ background: '#2c1417', borderColor: '#7a2f36', color: '#ff9999' }}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                </>
              )}
            </div>
          </div>
          {testResult && (
            testResult.kind === 'not_implemented' ? (
              <div className="rounded p-2 mt-1.5" style={{ background: '#18202a', border: '1px solid #2b3e57' }}>
                <p className="text-[11.5px] m-0" style={{ color: '#5b86b8' }}>
                  Test endpoint is 501 — not implemented yet.
                </p>
              </div>
            ) : testResult.kind === 'error' ? (
              <div className="rounded p-2 mt-1.5" style={{ background: '#2c1417', border: '1px solid #7a2f36' }}>
                <p className="text-[11.5px] m-0" style={{ color: '#ff5c5c' }}>{testResult.message}</p>
              </div>
            ) : (
              <div className="rounded p-2 mt-1.5" style={{ background: '#162a1c', border: '1px solid #2f6a3f' }}>
                <p className="text-[11.5px] m-0" style={{ color: '#66e07a' }}>
                  {testResult.data.ok ? 'OK' : 'Failed'}
                  {testResult.data.status_code ? ` · HTTP ${testResult.data.status_code}` : ''}
                  {testResult.data.duration_ms ? ` · ${testResult.data.duration_ms}ms` : ''}
                  {testResult.data.message ? ` · ${testResult.data.message}` : ''}
                </p>
              </div>
            )
          )}
          {rowError && (
            <div className="rounded p-2 mt-1.5" style={{ background: '#2c1417', border: '1px solid #7a2f36' }}>
              <p className="text-[11.5px] m-0" style={{ color: '#ff5c5c' }}>{rowError}</p>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function EndpointForm({
  initial, onSubmit, onCancel, submitLabel,
}: {
  initial?: WebhookEndpoint;
  onSubmit: (body: WebhookEndpointCreateBody) => Promise<string | null>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [url,           setUrl]           = useState(initial?.url ?? '');
  const [authHeader,    setAuthHeader]    = useState(initial?.auth_header ?? '');
  const [alertLevels,   setAlertLevels]   = useState<AlertSeverity[]>(initial?.alert_levels ?? ['HIGH', 'CRITICAL']);
  const [enabledInForm, setEnabledInForm] = useState(initial?.enabled ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);

  async function doSubmit() {
    if (submitting) return;
    const trimmedUrl = url.trim();
    if (trimmedUrl === '' || !(trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://'))) {
      setFormError('URL must start with http:// or https://'); return;
    }
    if (alertLevels.length === 0) { setFormError('Pick at least one alert level.'); return; }
    setSubmitting(true);
    setFormError(null);
    const body: WebhookEndpointCreateBody = {
      url:          trimmedUrl,
      alert_levels: alertLevels,
      enabled:      enabledInForm,
    };
    if (authHeader.trim() !== '') body.auth_header = authHeader.trim();
    const err = await onSubmit(body);
    if (err) setFormError(err);
    setSubmitting(false);
  }

  return (
    <div className="rounded p-3.5 flex flex-col gap-3" style={{ background: '#232225', border: '1px solid #2a292c' }}>
      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-medium text-text-secondary">URL</label>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://hooks.example.com/nexrisk"
          className="rounded px-2.5 py-1.5 text-[13px] font-mono text-text-primary min-h-[34px] border focus:outline-none focus:border-accent"
          style={{ background: '#1a1a1d', borderColor: '#44454f' }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-medium text-text-secondary">Authorization header (optional)</label>
        <input
          type="text"
          value={authHeader}
          onChange={e => setAuthHeader(e.target.value)}
          placeholder="Bearer abc123"
          className="rounded px-2.5 py-1.5 text-[13px] font-mono text-text-primary min-h-[34px] border focus:outline-none focus:border-accent"
          style={{ background: '#1a1a1d', borderColor: '#44454f' }}
        />
        <span className="text-[10.5px] text-text-muted">
          Sent as the literal HTTP <span className="font-mono">Authorization</span> header on each alert POST.
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div>
          <div className="text-[12px] font-medium text-text-secondary">Enabled</div>
          <div className="text-[10.5px] text-text-muted">When off, endpoint is skipped on alert dispatch.</div>
        </div>
        <Toggle on={enabledInForm} onChange={setEnabledInForm} />
      </div>

      <div>
        <label className="text-[12px] font-medium text-text-secondary block mb-1.5">Alert levels</label>
        <SeverityPicker selected={alertLevels} onChange={setAlertLevels} />
      </div>

      {formError && (
        <div className="rounded p-2" style={{ background: '#2c1417', border: '1px solid #7a2f36' }}>
          <p className="text-[11.5px] m-0" style={{ color: '#ff5c5c' }}>{formError}</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1 rounded border border-border text-[12.5px] text-text-secondary hover:bg-surface-hover cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={doSubmit}
          disabled={submitting}
          className={clsx(
            'px-3 py-1 rounded border text-[12.5px] font-medium',
            'bg-accent border-accent text-[#0b0c0e]',
            submitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent-hover cursor-pointer',
          )}
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function SaveBar({
  dirty, saving, loading, onSave, onRevert, label = 'Save changes',
}: {
  dirty: boolean; saving: boolean; loading: boolean;
  onSave: () => void; onRevert: () => void; label?: string;
}) {
  return (
    <div className="px-5 py-3 border-t border-border flex justify-between items-center gap-3">
      <div className="text-[11.5px] text-text-muted leading-tight">
        Restart{' '}
        <span className="font-mono" style={{ color: '#e09a55' }}>nexrisk_service</span>
        {' '}after saving
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onRevert}
          disabled={!dirty || saving || loading}
          className={clsx(
            'px-3.5 py-1.5 rounded border text-sm font-medium transition-colors',
            'bg-transparent border-border text-text-secondary',
            dirty && !saving && !loading ? 'hover:bg-surface-hover cursor-pointer' : 'opacity-50 cursor-not-allowed',
          )}
        >
          Revert
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving || loading}
          className={clsx(
            'px-3.5 py-1.5 rounded border text-sm font-medium transition-colors',
            'bg-accent border-accent text-[#0b0c0e]',
            dirty && !saving && !loading ? 'hover:bg-accent-hover cursor-pointer' : 'opacity-50 cursor-not-allowed',
          )}
        >
          {saving ? 'Saving…' : label}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  on, onChange, disabled,
}: {
  on: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <span className="text-[11.5px] font-mono uppercase tracking-wide" style={{ color: on ? '#66e07a' : '#e09a55' }}>
        {on ? 'On' : 'Off'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => !disabled && onChange(!on)}
        disabled={disabled}
        className={clsx('relative rounded-full transition-colors', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
        style={{
          width: 36, height: 20,
          background: on ? '#49b3b3' : '#232225',
          border:     `1px solid ${on ? '#49b3b3' : '#44454f'}`,
          padding:    0,
        }}
      >
        <span
          className="block rounded-full"
          style={{
            width: 14, height: 14, margin: 1,
            background: '#fff',
            transform: on ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 0.15s',
          }}
        />
      </button>
    </div>
  );
}

function SelectField({
  label, value, options, onChange, helper, disabled,
}: {
  label: string; value: string; options: readonly string[];
  onChange: (v: string) => void; helper?: string; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[13px] font-medium text-text-secondary">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={clsx(
          'rounded px-3 py-1.5 text-[13px] font-mono w-full text-text-primary min-h-[34px]',
          'border focus:outline-none focus:border-accent cursor-pointer',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        style={{ background: '#232225', borderColor: '#44454f' }}
      >
        {options.map(opt => (
          <option key={opt} value={opt} style={{ background: '#232225', color: '#E6E6E6' }}>{opt}</option>
        ))}
      </select>
      {helper && <span className="text-[11.5px] text-text-muted leading-snug">{helper}</span>}
    </div>
  );
}

function ScalarField({
  label, value, onChange, placeholder, helper, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; helper?: string; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[13px] font-medium text-text-secondary">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={clsx(
          'rounded px-3 py-1.5 text-[13px] font-mono w-full text-text-primary min-h-[34px]',
          'border focus:outline-none focus:border-accent',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        style={{ background: '#232225', borderColor: '#44454f' }}
      />
      {helper && <span className="text-[11.5px] text-text-muted leading-snug">{helper}</span>}
    </div>
  );
}

function SeverityBadge({ level }: { level: AlertSeverity }) {
  const palette: Record<AlertSeverity, { bg: string; fg: string; br: string }> = {
    LOW:      { bg: '#162a1c', fg: '#66e07a', br: '#2f6a3f' },
    MEDIUM:   { bg: '#1a1a1d', fg: '#b6babf', br: '#44454f' },
    HIGH:     { bg: '#2a2016', fg: '#e09a55', br: '#6a4a2f' },
    CRITICAL: { bg: '#2c1417', fg: '#ff9999', br: '#7a2f36' },
  };
  const p = palette[level];
  return (
    <span
      className="text-[10.5px] font-mono uppercase px-1.5 py-0.5 rounded tracking-wide"
      style={{ background: p.bg, color: p.fg, border: `1px solid ${p.br}` }}
    >
      {level}
    </span>
  );
}

function SeverityPicker({
  selected, onChange,
}: {
  selected: AlertSeverity[]; onChange: (v: AlertSeverity[]) => void;
}) {
  function toggle(level: AlertSeverity) {
    onChange(selected.includes(level)
      ? selected.filter(x => x !== level)
      : [...selected, level]);
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {ALERT_SEVERITIES.map(level => {
        const on = selected.includes(level);
        return (
          <button
            key={level}
            type="button"
            onClick={() => toggle(level)}
            className={clsx(
              'px-2.5 py-1 rounded border text-[11.5px] font-mono uppercase tracking-wide cursor-pointer transition-colors',
            )}
            style={{
              background:  on ? '#49b3b3' : 'transparent',
              borderColor: on ? '#49b3b3' : '#44454f',
              color:       on ? '#0b0c0e' : '#d2d6e2',
            }}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

function TestResultBanner({ result, labelOk }: { result: ApiResult<TelegramTestResponse>; labelOk: string }) {
  if (result.kind === 'not_implemented') {
    return (
      <div className="rounded p-2 mt-1.5" style={{ background: '#18202a', border: '1px solid #2b3e57' }}>
        <p className="text-[11.5px] m-0" style={{ color: '#5b86b8' }}>
          Test endpoint is 501 — not implemented yet.
        </p>
      </div>
    );
  }
  if (result.kind === 'error') {
    return (
      <div className="rounded p-2 mt-1.5" style={{ background: '#2c1417', border: '1px solid #7a2f36' }}>
        <p className="text-[11.5px] m-0" style={{ color: '#ff5c5c' }}>{result.message}</p>
      </div>
    );
  }
  return (
    <div className="rounded p-2 mt-1.5" style={{ background: '#162a1c', border: '1px solid #2f6a3f' }}>
      <p className="text-[11.5px] m-0" style={{ color: '#66e07a' }}>
        {labelOk}{result.data.message_id ? ` · id ${result.data.message_id}` : ''}
      </p>    </div>
  );
}

export default AlertingPage;
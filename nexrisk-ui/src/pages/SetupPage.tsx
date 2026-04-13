import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/stores/AuthContext';
import { A, AuthLogo, AuthFooter } from './authStyles';

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

function StepBar({ current }: { current: Step }) {
  const labels = ['Set password', 'Scan QR code', 'Verify code'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const done = n < current; const active = n === current;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: `2px solid ${active || done ? '#4ecdc4' : '#2e2c32'}`,
                background: done ? '#4ecdc4' : active ? 'rgba(78,205,196,0.12)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                color: done ? '#131214' : active ? '#4ecdc4' : '#3a3840',
                fontFamily: '"IBM Plex Mono", monospace',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{
                fontSize: 10, marginTop: 5, whiteSpace: 'nowrap',
                fontFamily: '"IBM Plex Mono", monospace',
                color: active ? '#e0e0e0' : done ? '#4ecdc4' : '#3a3840',
              }}>{label}</span>
            </div>
            {i < 2 && (
              <div style={{
                height: 2, flex: 1,
                background: n < current ? '#4ecdc4' : '#2e2c32',
                marginBottom: 20, marginLeft: -6, marginRight: -6,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOTP digit input
// ─────────────────────────────────────────────────────────────────────────────

function TotpInput({ value, onChange, hasError }: {
  value: string; onChange: (v: string) => void; hasError: boolean;
}) {
  const refs = [
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
  ];
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  function handleChange(idx: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[idx] = digit;
    onChange(next.join(''));
    if (digit && idx < 5) refs[idx + 1].current?.focus();
  }
  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) refs[idx - 1].current?.focus();
    if (e.key === 'ArrowLeft'  && idx > 0) refs[idx - 1].current?.focus();
    if (e.key === 'ArrowRight' && idx < 5) refs[idx + 1].current?.focus();
  }
  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) { onChange(pasted.padEnd(6, '').slice(0, 6)); refs[Math.min(pasted.length, 5)].current?.focus(); }
    e.preventDefault();
  }

  return (
    <div style={A.totpRow} onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          style={{ ...A.digitInput, borderColor: hasError ? '#ff6b6b' : d ? '#4ecdc4' : '#2e2c32' }}
          autoComplete="one-time-code" autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function SetupPage() {
  const { completeSetup } = useAuth();
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const inviteToken     = searchParams.get('token') ?? '';

  const [step, setStep]   = useState<Step>(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwFocused, setPwFocused]             = useState(false);
  const [cfFocused, setCfFocused]             = useState(false);

  const [qrDataUri, setQrDataUri]   = useState('');
  const [secret, setSecret]         = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const [totpCode, setTotpCode] = useState('');

  useEffect(() => {
    if (!inviteToken) setError('Invalid setup link. Please request a new invitation.');
  }, [inviteToken]);

  useEffect(() => {
    if (step === 3 && totpCode.replace(/\D/g, '').length === 6) void handleTotpVerify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpCode, step]);

  async function handleClaimSubmit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (password.length < 10) { setError('Password must be at least 10 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/setup/claim', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? data.error ?? `Error ${res.status}`); return; }
      await fetchQr();
      setStep(2);
    } catch { setError('Network error. Please check your connection.'); }
    finally { setLoading(false); }
  }

  async function fetchQr() {
    try {
      const res = await fetch('/api/v1/auth/setup/totp', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? data.error ?? `Error ${res.status}`); return; }
      setQrDataUri(data.qr_data_uri ?? '');
      setSecret(data.secret ?? '');
    } catch { setError('Failed to load QR code. Please refresh the page.'); }
  }

  async function handleTotpVerify() {
    if (loading) return;
    const code = totpCode.replace(/\D/g, '');
    if (code.length !== 6) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/v1/auth/setup/totp/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? data.error ?? 'Verification failed.'); setTotpCode(''); return; }
      completeSetup(data.user, data.permissions ?? {});
      navigate('/', { replace: true });
    } catch { setError('Network error. Please check your connection.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={A.page}>
        <AuthLogo />
      <div style={{ ...A.card, maxWidth: 480 }}>
        <StepBar current={step} />

        {/* ── Step 1 ── */}
        {step === 1 && (
          <>
            <h1 style={A.heading}>Set your password</h1>
            <p style={A.subheading}>
              Minimum 10 characters. You will use this to sign in going forward.
            </p>

            {error && <div style={A.errorBox}>{error}</div>}

            <form onSubmit={handleClaimSubmit} noValidate>
              <div style={A.fieldGroup}>
                <label style={A.label} htmlFor="sp-pw">New password</label>
                <input id="sp-pw" type="password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setPwFocused(true)} onBlur={() => setPwFocused(false)}
                  style={{ ...A.input, borderColor: pwFocused ? '#4ecdc4' : '#2e2c32' }}
                  placeholder="At least 10 characters" autoComplete="new-password"
                  autoFocus disabled={!inviteToken} />
                {password.length > 0 && password.length < 10 && (
                  <p style={A.hintError}>
                    {10 - password.length} more character{10 - password.length !== 1 ? 's' : ''} required
                  </p>
                )}
              </div>

              <div style={A.fieldGroup}>
                <label style={A.label} htmlFor="sp-cf">Confirm password</label>
                <input id="sp-cf" type="password" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onFocus={() => setCfFocused(true)} onBlur={() => setCfFocused(false)}
                  style={{
                    ...A.input,
                    borderColor: cfFocused ? '#4ecdc4'
                      : confirmPassword && confirmPassword !== password ? '#ff6b6b'
                      : '#2e2c32',
                  }}
                  placeholder="Re-enter your password" autoComplete="new-password"
                  disabled={!inviteToken} />
                {confirmPassword && confirmPassword !== password && (
                  <p style={A.hintError}>Passwords do not match</p>
                )}
              </div>

              <button type="submit"
                style={{
                  ...A.btnPrimary,
                  ...(!inviteToken || loading || password.length < 10 || password !== confirmPassword
                    ? A.btnPrimaryDisabled : {}),
                }}
                disabled={!inviteToken || loading || password.length < 10 || password !== confirmPassword}>
                {loading ? 'Saving…' : 'Set Password →'}
              </button>
            </form>
          </>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <>
            <h1 style={A.heading}>Set up two-factor authentication</h1>
            <p style={A.subheading}>
              Scan the QR code with your authenticator app. You will need it every time you sign in.
            </p>

            {error && <div style={A.errorBox}>{error}</div>}

            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              background: '#131214', border: '1px solid #2e2c32', borderRadius: 6,
              padding: '28px 24px', marginBottom: 20,
            }}>
              {!qrDataUri ? (
                <div style={{ color: '#6a6870', fontSize: 12, padding: '40px 0' }}>Loading…</div>
              ) : qrDataUri.startsWith('data:image') ? (
                <img src={qrDataUri} alt="TOTP QR code"
                  style={{ width: 200, height: 200, imageRendering: 'pixelated' }} />
              ) : (
                <div style={{ color: '#ff8f8f', fontSize: 12, textAlign: 'center' }}>
                  QR code unavailable. Use the manual entry key below.
                </div>
              )}
              <p style={{ ...A.hint, margin: 0, textAlign: 'center' }}>
                Scan with Google Authenticator, Authy, or 1Password
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <button
                style={{ background: 'none', border: 'none', color: '#4ecdc4', fontSize: 11,
                  cursor: 'pointer', fontFamily: '"IBM Plex Mono", monospace', padding: 0, marginBottom: 8 }}
                onClick={() => setShowSecret(v => !v)}>
                {showSecret ? '▲ Hide' : '▼ Show'} manual entry key
              </button>
              {showSecret && secret && (
                <>
                  <div style={{
                    background: '#131214', border: '1px solid #2e2c32', borderRadius: 4,
                    padding: '10px 14px', fontSize: 12, color: '#e0e0e0',
                    letterSpacing: '0.1em', wordBreak: 'break-all', textAlign: 'center',
                    fontFamily: '"IBM Plex Mono", monospace',
                  }}>{secret}</div>
                  <p style={{ ...A.hint, marginTop: 6 }}>
                    Type this key manually if you cannot scan the QR code. Keep it private.
                  </p>
                </>
              )}
            </div>

            <button style={A.btnPrimary} onClick={() => { setStep(3); setTotpCode(''); }}>
              I've scanned the code →
            </button>
          </>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <>
            <h1 style={A.heading}>Verify your authenticator</h1>
            <p style={{ ...A.subheading, marginBottom: 28 }}>
              Enter the 6-digit code shown in your authenticator app to complete enrollment.
            </p>

            {error && <div style={A.errorBox}>{error}</div>}

            <TotpInput value={totpCode} onChange={setTotpCode} hasError={!!error} />
            <p style={{ ...A.hint, textAlign: 'center', marginBottom: 24 }}>
              Code refreshes every 30 seconds
            </p>

            <button
              style={{ ...A.btnPrimary, ...(loading || totpCode.replace(/\D/g, '').length < 6 ? A.btnPrimaryDisabled : {}) }}
              disabled={loading || totpCode.replace(/\D/g, '').length < 6}
              onClick={() => void handleTotpVerify()}>
              {loading ? 'Verifying…' : 'Complete Setup'}
            </button>

            <button style={A.btnGhost} onClick={() => { setStep(2); setError(''); setTotpCode(''); }}>
              ← Back to QR code
            </button>
          </>
        )}

      </div>
      <AuthFooter />
    </div>
  );
}
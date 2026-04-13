import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/AuthContext';
import { A, AuthLogo, AuthFooter } from './authStyles';

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
          style={{ ...A.digitInput, borderColor: hasError ? '#ff6b6b' : d ? '#4ecdc4' : '#3a3840' }}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Step = 'credentials' | 'totp';

export function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const [step, setStep]         = useState<Step>('credentials');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [emailFocused, setEmailFocused]       = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  useEffect(() => {
    if (step === 'totp' && totpCode.replace(/\D/g, '').length === 6) {
      void doLogin(totpCode.replace(/\D/g, ''));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpCode, step]);

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    await doLogin(undefined);
  }

  async function doLogin(code: string | undefined) {
    if (loading) return;
    setLoading(true); setError('');
    const result = await login(email.trim(), password, code);
    setLoading(false);

    if (result.ok) { navigate(from, { replace: true }); return; }

    if ('gate' in result) {
      if (result.gate === 'MUST_CHANGE_PASSWORD' && result.isRoot) {
        navigate('/change-password', { state: { email: email.trim() } });
      } else {
        navigate('/setup', { replace: true });
      }
      return;
    }
    if ('needsTotp' in result) { setStep('totp'); return; }
    setError(result.error);
    if (step === 'totp') setTotpCode('');
  }

  // ── Credentials step ──────────────────────────────────────────────────────

  if (step === 'credentials') {
    return (
      <div style={A.page}>
        <AuthLogo />

        <div style={A.card}>
          <h1 style={A.heading}>Sign in</h1>
          <p style={A.subheading}>Enter your credentials to access the platform.</p>

          {error && <div style={A.errorBox}>{error}</div>}

          <form onSubmit={handleCredentialsSubmit} noValidate>
            <div style={A.fieldGroup}>
              <label style={A.label} htmlFor="lg-email">Email</label>
              <input id="lg-email" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                style={{ ...A.input, borderColor: emailFocused ? '#4ecdc4' : '#3a3840' }}
                placeholder="you@example.com" autoComplete="email" autoFocus required />
            </div>

            <div style={A.fieldGroup}>
              <label style={A.label} htmlFor="lg-password">Password</label>
              <input id="lg-password" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                style={{ ...A.input, borderColor: passwordFocused ? '#4ecdc4' : '#3a3840' }}
                placeholder="••••••••••" autoComplete="current-password" required />
            </div>

            <button type="submit"
              style={{ ...A.btnPrimary, ...(loading || !email || !password ? A.btnPrimaryDisabled : {}) }}
              disabled={loading || !email || !password}>
              {loading ? 'Signing in…' : 'Continue →'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center' as const }}>
            <a href="/forgot-password"
              style={{ fontSize: 13, color: '#49b3b3', textDecoration: 'none', fontFamily: '"IBM Plex Mono", monospace' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
              Forgot password?
            </a>
          </div>
        </div>

        <AuthFooter />
      </div>
    );
  }

  // ── TOTP step ─────────────────────────────────────────────────────────────

  return (
    <div style={A.page}>
      <AuthLogo />

      <div style={A.card}>
        <button style={A.backBtn}
          onClick={() => { setStep('credentials'); setError(''); setTotpCode(''); }}>
          ← Back
        </button>

        <h1 style={A.heading}>Two-factor authentication</h1>
        <p style={{ ...A.subheading, marginBottom: 28 }}>
          Enter the 6-digit code for{' '}
          <span style={{ color: '#ffffff' }}>{email}</span>.
        </p>

        {error && <div style={A.errorBox}>{error}</div>}

        <div style={{ marginBottom: 28 }}>
          <TotpInput value={totpCode} onChange={setTotpCode} hasError={!!error} />
          <p style={{ ...A.hint, textAlign: 'center', marginTop: 12 }}>
            Code refreshes every 30 seconds
          </p>
        </div>

        <button
          style={{ ...A.btnPrimary, ...(loading || totpCode.replace(/\D/g, '').length < 6 ? A.btnPrimaryDisabled : {}) }}
          disabled={loading || totpCode.replace(/\D/g, '').length < 6}
          onClick={() => doLogin(totpCode.replace(/\D/g, ''))}>
          {loading ? 'Verifying…' : 'Verify & Sign in'}
        </button>
      </div>

      <AuthFooter />
    </div>
  );
}
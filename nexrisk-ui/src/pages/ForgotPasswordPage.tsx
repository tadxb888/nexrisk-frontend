import { useState, type FormEvent } from 'react';
import { A, AuthLogo, AuthFooter } from './authStyles';

export function ForgotPasswordPage() {
  const [email, setEmail]       = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Email is required.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always show success — backend never reveals whether email exists
      if (res.ok || res.status === 200) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
        setError(data.message ?? data.error ?? `Error ${res.status}`);
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={A.page}>
      <AuthLogo />

      <div style={A.card}>
        {!submitted ? (
          <>
            <h1 style={A.heading}>Forgot password</h1>
            <p style={A.subheading}>
              Enter your account email. If it exists in the system, you will receive a reset link within a few minutes.
            </p>

            {error && <div style={A.errorBox}>{error}</div>}

            <form onSubmit={handleSubmit} noValidate>
              <div style={A.fieldGroup}>
                <label style={A.label} htmlFor="fp-email">Email</label>
                <input id="fp-email" type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  style={{ ...A.input, borderColor: emailFocused ? '#4ecdc4' : '#3a3840' }}
                  placeholder="you@example.com" autoComplete="email" autoFocus required />
              </div>

              <button type="submit"
                style={{ ...A.btnPrimary, ...(loading || !email.trim() ? A.btnPrimaryDisabled : {}) }}
                disabled={loading || !email.trim()}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>

            <div style={{ marginTop: 20, textAlign: 'center' as const }}>
              <a href="/login"
                style={{ fontSize: 13, color: '#49b3b3', textDecoration: 'none', fontFamily: '"IBM Plex Mono", monospace' }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                ← Back to sign in
              </a>
            </div>
          </>
        ) : (
          <>
            <h1 style={A.heading}>Check your email</h1>
            <p style={A.subheading}>
              If <span style={{ color: '#ffffff' }}>{email}</span> is registered, a password reset link has been sent. The link expires in 1 hour.
            </p>

            <div style={A.successBox}>
              Reset link sent. Check your inbox and spam folder.
            </div>

            <div style={{ textAlign: 'center' as const }}>
              <a href="/login"
                style={{ fontSize: 13, color: '#49b3b3', textDecoration: 'none', fontFamily: '"IBM Plex Mono", monospace' }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                ← Back to sign in
              </a>
            </div>
          </>
        )}
      </div>

      <AuthFooter />
    </div>
  );
}
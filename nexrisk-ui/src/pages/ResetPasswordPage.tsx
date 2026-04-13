import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { A, AuthLogo, AuthFooter } from './authStyles';

export function ResetPasswordPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken     = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPw]   = useState('');
  const [newFocused, setNewFocused]       = useState(false);
  const [cfFocused, setCfFocused]         = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [success, setSuccess]             = useState(false);

  useEffect(() => {
    if (!resetToken) setError('Invalid or missing reset link. Please request a new one.');
  }, [resetToken]);

  const canSubmit = !loading && !success &&
    !!resetToken &&
    newPassword.length >= 10 &&
    newPassword === confirmPassword;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 10) { setError('Password must be at least 10 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
      if (!res.ok) { setError(data.message ?? data.error ?? `Error ${res.status}`); return; }
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
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
        <h1 style={A.heading}>Reset your password</h1>
        <p style={A.subheading}>
          Choose a new password. Minimum 10 characters.
        </p>

        {error   && <div style={A.errorBox}>{error}</div>}
        {success && (
          <div style={A.successBox}>
            Password reset successfully. Redirecting to sign in…
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} noValidate>
            <div style={A.fieldGroup}>
              <label style={A.label} htmlFor="rp-new">New password</label>
              <input id="rp-new" type="password" value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onFocus={() => setNewFocused(true)} onBlur={() => setNewFocused(false)}
                style={{ ...A.input, borderColor: newFocused ? '#4ecdc4' : '#3a3840' }}
                placeholder="At least 10 characters" autoComplete="new-password"
                autoFocus disabled={!resetToken} />
              {newPassword.length > 0 && newPassword.length < 10 && (
                <p style={A.hintError}>
                  {10 - newPassword.length} more character{10 - newPassword.length !== 1 ? 's' : ''} required
                </p>
              )}
            </div>

            <div style={A.fieldGroup}>
              <label style={A.label} htmlFor="rp-confirm">Confirm new password</label>
              <input id="rp-confirm" type="password" value={confirmPassword}
                onChange={e => setConfirmPw(e.target.value)}
                onFocus={() => setCfFocused(true)} onBlur={() => setCfFocused(false)}
                style={{
                  ...A.input,
                  borderColor: cfFocused ? '#4ecdc4'
                    : confirmPassword && confirmPassword !== newPassword ? '#ff6b6b'
                    : '#3a3840',
                }}
                placeholder="Re-enter new password" autoComplete="new-password"
                disabled={!resetToken} />
              {confirmPassword && confirmPassword !== newPassword && (
                <p style={A.hintError}>Passwords do not match</p>
              )}
            </div>

            <button type="submit"
              style={{ ...A.btnPrimary, ...(!canSubmit ? A.btnPrimaryDisabled : {}) }}
              disabled={!canSubmit}>
              {loading ? 'Saving…' : 'Reset Password'}
            </button>
          </form>
        )}

        {!success && (
          <div style={{ marginTop: 20, textAlign: 'center' as const }}>
            <a href="/forgot-password"
              style={{ fontSize: 13, color: '#49b3b3', textDecoration: 'none', fontFamily: '"IBM Plex Mono", monospace' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
              Request a new reset link
            </a>
          </div>
        )}
      </div>

      <AuthFooter />
    </div>
  );
}
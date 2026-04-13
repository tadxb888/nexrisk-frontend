import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { A, AuthLogo, AuthFooter } from './authStyles';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const emailFromState = (location.state as { email?: string } | null)?.email ?? '';

  const [email, setEmail]               = useState(emailFromState);
  const [currentPassword, setCurrentPw] = useState('');
  const [newPassword, setNewPassword]   = useState('');
  const [confirmPassword, setConfirmPw] = useState('');
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState(false);
  const [loading, setLoading]           = useState(false);

  const [emailFocused, setEmailFocused] = useState(false);
  const [currFocused, setCurrFocused]   = useState(false);
  const [newFocused, setNewFocused]     = useState(false);
  const [cfFocused, setCfFocused]       = useState(false);

  const canSubmit = !loading && !success &&
    email.trim().length > 0 && currentPassword.length > 0 &&
    newPassword.length >= 10 && newPassword === confirmPassword;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (newPassword.length < 10) { setError('New password must be at least 10 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? data.error ?? `Error ${res.status}`); return; }
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch { setError('Network error. Please check your connection.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={A.page}>
        <AuthLogo />
      <div style={A.card}>
        <h1 style={A.heading}>Set your password</h1>
        <p style={A.subheading}>
          Your account requires a password change before you can access the platform.
        </p>

        {error   && <div style={A.errorBox}>{error}</div>}
        {success && <div style={A.successBox}>Password changed. Redirecting to sign in…</div>}

        <form onSubmit={handleSubmit} noValidate>
          {!emailFromState && (
            <div style={A.fieldGroup}>
              <label style={A.label} htmlFor="cp-email">Email</label>
              <input id="cp-email" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)} onBlur={() => setEmailFocused(false)}
                style={{ ...A.input, borderColor: emailFocused ? '#4ecdc4' : '#2e2c32' }}
                placeholder="you@example.com" autoComplete="email" autoFocus disabled={success} />
            </div>
          )}

          <div style={A.fieldGroup}>
            <label style={A.label} htmlFor="cp-current">Current password</label>
            <input id="cp-current" type="password" value={currentPassword}
              onChange={e => setCurrentPw(e.target.value)}
              onFocus={() => setCurrFocused(true)} onBlur={() => setCurrFocused(false)}
              style={{ ...A.input, borderColor: currFocused ? '#4ecdc4' : '#2e2c32' }}
              placeholder="Your current password" autoComplete="current-password"
              autoFocus={!!emailFromState} disabled={success} />
          </div>

          <div style={A.fieldGroup}>
            <label style={A.label} htmlFor="cp-new">New password</label>
            <input id="cp-new" type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onFocus={() => setNewFocused(true)} onBlur={() => setNewFocused(false)}
              style={{ ...A.input, borderColor: newFocused ? '#4ecdc4' : '#2e2c32' }}
              placeholder="At least 10 characters" autoComplete="new-password" disabled={success} />
            {newPassword.length > 0 && newPassword.length < 10 && (
              <p style={A.hintError}>
                {10 - newPassword.length} more character{10 - newPassword.length !== 1 ? 's' : ''} required
              </p>
            )}
          </div>

          <div style={A.fieldGroup}>
            <label style={A.label} htmlFor="cp-confirm">Confirm new password</label>
            <input id="cp-confirm" type="password" value={confirmPassword}
              onChange={e => setConfirmPw(e.target.value)}
              onFocus={() => setCfFocused(true)} onBlur={() => setCfFocused(false)}
              style={{
                ...A.input,
                borderColor: cfFocused ? '#4ecdc4'
                  : confirmPassword && confirmPassword !== newPassword ? '#ff6b6b'
                  : '#2e2c32',
              }}
              placeholder="Re-enter new password" autoComplete="new-password" disabled={success} />
            {confirmPassword && confirmPassword !== newPassword && (
              <p style={A.hintError}>Passwords do not match</p>
            )}
          </div>

          <button type="submit"
            style={{ ...A.btnPrimary, ...(!canSubmit ? A.btnPrimaryDisabled : {}) }}
            disabled={!canSubmit}>
            {loading ? 'Saving…' : 'Change Password'}
          </button>
        </form>

      </div>
      <AuthFooter />
    </div>
  );
}
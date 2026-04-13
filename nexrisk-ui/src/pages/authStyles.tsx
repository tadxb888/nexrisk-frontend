// ─────────────────────────────────────────────────────────────────────────────
// Shared auth design tokens — LoginPage, SetupPage, ChangePasswordPage
// Brand: Taiga · #4ecdc4 teal · IBM Plex Mono
// ─────────────────────────────────────────────────────────────────────────────

export const A = {
  // ── Page shell ─────────────────────────────────────────────────────────────
  // Logo lives at top-left of the page (absolute), card is centred.
  page: {
    minHeight: '100vh',
    background: '#131214',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"IBM Plex Mono", monospace',
    padding: '24px',
    position: 'relative' as const,
  } as React.CSSProperties,

  // Logo — fixed top-left of the viewport
  logoFixed: {
    position: 'fixed' as const,
    top: 28,
    left: 36,
    zIndex: 10,
  } as React.CSSProperties,

  logoImg: {
    height: 64,       // doubled from 32
    width: 'auto',
    display: 'block',
  } as React.CSSProperties,

  // ── Card ───────────────────────────────────────────────────────────────────
  card: {
    width: '100%',
    maxWidth: 528,    // 440 × 1.2 = 528
    background: '#1e1c20',
    border: '1px solid #3a3840',
    borderRadius: 8,
    padding: '44px 44px 40px',
  } as React.CSSProperties,

  // ── Typography ─────────────────────────────────────────────────────────────
  heading: {
    fontSize: 19,     // 17 + 2
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 6px',
    letterSpacing: '0.01em',
  } as React.CSSProperties,

  subheading: {
    fontSize: 14,     // 12 + 2
    color: '#c8c6d0', // bright — not muted
    margin: '0 0 28px',
    lineHeight: 1.6,
  } as React.CSSProperties,

  // ── Form elements ──────────────────────────────────────────────────────────
  label: {
    display: 'block',
    fontSize: 12,     // 10 + 2
    color: '#c8c6d0', // bright — not muted
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    marginBottom: 7,
  } as React.CSSProperties,

  input: {
    width: '100%',
    background: '#131214',
    border: '1px solid #3a3840',
    borderRadius: 5,
    padding: '11px 14px',
    fontSize: 15,     // 13 + 2
    color: '#ffffff',
    fontFamily: '"IBM Plex Mono", monospace',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  } as React.CSSProperties,

  fieldGroup: {
    marginBottom: 20,
  } as React.CSSProperties,

  hint: {
    fontSize: 13,     // 11 + 2
    color: '#a0a0b0', // readable — not dark grey
    marginTop: 6,
    lineHeight: 1.5,
  } as React.CSSProperties,

  hintError: {
    fontSize: 13,
    color: '#ff6b6b',
    marginTop: 6,
    lineHeight: 1.5,
  } as React.CSSProperties,

  // ── Buttons ────────────────────────────────────────────────────────────────
  btnPrimary: {
    width: '100%',
    padding: '12px 0',
    background: '#4ecdc4',
    border: 'none',
    borderRadius: 5,
    fontSize: 15,     // 13 + 2
    fontWeight: 700,
    color: '#131214',
    fontFamily: '"IBM Plex Mono", monospace',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'background 0.15s',
  } as React.CSSProperties,

  btnPrimaryDisabled: {
    background: '#2a4a48',
    color: '#5a9a96',
    cursor: 'not-allowed',
  } as React.CSSProperties,

  btnGhost: {
    width: '100%',
    padding: '11px 0',
    background: 'transparent',
    border: '1px solid #3a3840',
    borderRadius: 5,
    fontSize: 15,     // 13 + 2
    color: '#c8c6d0',
    fontFamily: '"IBM Plex Mono", monospace',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'border-color 0.15s, color 0.15s',
    marginTop: 10,
  } as React.CSSProperties,

  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,     // 12 + 1
    color: '#c8c6d0', // bright — not dark grey
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"IBM Plex Mono", monospace',
    padding: 0,
    marginBottom: 24,
    transition: 'color 0.15s',
  } as React.CSSProperties,

  // ── Alerts ─────────────────────────────────────────────────────────────────
  errorBox: {
    background: 'rgba(255,107,107,0.08)',
    border: '1px solid rgba(255,107,107,0.35)',
    borderRadius: 5,
    padding: '11px 14px',
    fontSize: 13,     // 12 + 1
    color: '#ff8f8f',
    marginBottom: 20,
    lineHeight: 1.5,
  } as React.CSSProperties,

  successBox: {
    background: 'rgba(78,205,196,0.08)',
    border: '1px solid rgba(78,205,196,0.35)',
    borderRadius: 5,
    padding: '11px 14px',
    fontSize: 13,
    color: '#4ecdc4',
    marginBottom: 20,
    lineHeight: 1.5,
  } as React.CSSProperties,

  // ── TOTP digits ────────────────────────────────────────────────────────────
  totpRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
  } as React.CSSProperties,

  digitInput: {
    width: 48,
    height: 56,
    background: '#131214',
    border: '1px solid #3a3840',
    borderRadius: 5,
    textAlign: 'center' as const,
    fontSize: 26,     // 24 + 2
    fontWeight: 700,
    color: '#ffffff',
    fontFamily: '"IBM Plex Mono", monospace',
    outline: 'none',
    transition: 'border-color 0.15s',
  } as React.CSSProperties,

  // ── Misc ───────────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    background: '#3a3840',
    margin: '24px 0',
  } as React.CSSProperties,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Logo — rendered at top-left of the page, outside the card
// ─────────────────────────────────────────────────────────────────────────────

export function AuthLogo() {
  return (
    <div style={A.logoFixed}>
      <img
        src="/taiga-logo-final.png"
        alt="Taiga"
        style={A.logoImg}
        onError={e => {
          e.currentTarget.style.display = 'none';
          const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
          if (fb) fb.style.display = 'block';
        }}
      />
      {/* Text fallback */}
      <span style={{ display: 'none', fontSize: 24, fontWeight: 700, color: '#4ecdc4', letterSpacing: '0.08em' }}>
        TAIGA
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page footer — legal links, shown on all auth pages
// ─────────────────────────────────────────────────────────────────────────────

export function AuthFooter() {
  const linkStyle: React.CSSProperties = {
    color: '#808080',
    textDecoration: 'none',
    fontSize: 11,
    letterSpacing: '0.04em',
    transition: 'color 0.15s',
    cursor: 'pointer',
  };

  return (
    <div style={{
      marginTop: 32,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const, justifyContent: 'center' }}>
        <a href="/terms" style={linkStyle}
          onMouseEnter={e => (e.currentTarget.style.color = '#4ecdc4')}
          onMouseLeave={e => (e.currentTarget.style.color = '#808080')}>
          Terms of Use
        </a>
        <span style={{ color: '#3a3840', fontSize: 11 }}>·</span>
        <a href="/disclosure" style={linkStyle}
          onMouseEnter={e => (e.currentTarget.style.color = '#4ecdc4')}
          onMouseLeave={e => (e.currentTarget.style.color = '#808080')}>
          Disclosure
        </a>
        <span style={{ color: '#3a3840', fontSize: 11 }}>·</span>
        <a href="/privacy" style={linkStyle}
          onMouseEnter={e => (e.currentTarget.style.color = '#4ecdc4')}
          onMouseLeave={e => (e.currentTarget.style.color = '#808080')}>
          Privacy Policy
        </a>
      </div>
      <p style={{ fontSize: 11, color: '#505060', margin: 0, textAlign: 'center' as const }}>
        © 2026 Taiga Ltd, England. All rights reserved.
      </p>
    </div>
  );
}
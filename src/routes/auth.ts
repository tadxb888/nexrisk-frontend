import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskFetch } from '../services/nexrisk-api.js';
import { sendPasswordResetEmail } from '../services/email.js';
import { sessionStore, type SessionUser } from '../services/session-store.js';
import { config } from '../config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types mirroring the C++ response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface LoginResponse {
  status: string;
  access_token: string;
  user: SessionUser;
  permissions: Record<string, string>;
}

interface SetupClaimResponse {
  status: string;
  enrollment_token: string;
  message: string;
}

interface SetupTotpResponse {
  status: string;
  qr_uri: string;
  secret: string;
  message: string;
}

interface RefreshResponse {
  access_token: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp_code: z.string().optional(),
});

const SetupClaimSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
  new_password: z.string().min(10, 'Password must be at least 10 characters'),
});

const TotpVerifySchema = z.object({
  code: z.string().length(6, 'TOTP code must be exactly 6 digits'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Cookie constants
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'nexrisk_session';
const SETUP_COOKIE   = 'nexrisk_setup';

/** 8 hours — matches the refresh token TTL */
const SESSION_MAX_AGE = 8 * 60 * 60;

/** 10 minutes — matches the enrollment_token TTL on the C++ server */
const SETUP_MAX_AGE = 10 * 60;

// ─────────────────────────────────────────────────────────────────────────────
// Cookie helpers
// ─────────────────────────────────────────────────────────────────────────────

function setMainSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

function clearMainSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

function setSetupCookie(reply: FastifyReply, setupSessionId: string): void {
  reply.setCookie(SETUP_COOKIE, setupSessionId, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',              // Broad path so /setup/totp (GET) and /setup/totp/verify (POST) can both read it
    maxAge: SETUP_MAX_AGE,
  });
}

function clearSetupCookie(reply: FastifyReply): void {
  reply.clearCookie(SETUP_COOKIE, { path: '/' });
}

function getCookie(request: FastifyRequest, name: string): string | undefined {
  return (request.cookies as Record<string, string | undefined>)[name];
}

// ─────────────────────────────────────────────────────────────────────────────
// QR code generator (uses `qrcode` npm package)
// Install: npm install qrcode && npm install --save-dev @types/qrcode
// ─────────────────────────────────────────────────────────────────────────────

async function toQrDataUri(otpauthUri: string): Promise<string> {
  try {
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toDataURL(otpauthUri, {
      width: 240,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    // qrcode not installed — return the raw URI and let the client handle it
    return otpauthUri;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: forward the C++ Set-Cookie (nexrisk_refresh) back to the browser
// The refresh cookie must be scoped to the BFF's refresh path, not C++'s.
// ─────────────────────────────────────────────────────────────────────────────

function forwardRefreshCookie(
  rawSetCookieHeaders: string | string[] | undefined,
  reply: FastifyReply,
): void {
  if (!rawSetCookieHeaders) return;

  const headers = Array.isArray(rawSetCookieHeaders)
    ? rawSetCookieHeaders
    : [rawSetCookieHeaders];

  for (const header of headers) {
    if (!header.toLowerCase().startsWith('nexrisk_refresh=')) continue;

    // Extract the raw value (everything before the first ';')
    const rawValue = header.split(';')[0].split('=').slice(1).join('=');

    reply.setCookie('nexrisk_refresh', rawValue, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      // Scope to the BFF refresh path so the browser sends it automatically on refresh
      path: '/api/v1/auth/refresh',
      maxAge: 8 * 60 * 60, // 8 hours
    });
    break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /auth/login ─────────────────────────────────────────────────────

  fastify.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const result = await nexriskFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: parsed.data,
    });

    if (!result.ok) {
      const errBody = result.error as Record<string, unknown>;

      // First-login gates: 403 + status field (not the `error` field)
      // MUST_CHANGE_PASSWORD → tell frontend to redirect to /setup
      // TOTP_NOT_ENROLLED    → same
      if (result.status === 403 && errBody?.status) {
        return reply.code(403).send(errBody);
      }

      return reply.code(result.status).send(result.error);
    }

    const { access_token, user, permissions } = result.data!;

    // Create BFF session — access_token stays server-side
    const sessionId = sessionStore.create({ accessToken: access_token, user, permissions });
    setMainSessionCookie(reply, sessionId);

    // Forward the refresh token cookie C++ set (if present)
    forwardRefreshCookie(result.setCookies, reply);

    // Return user identity + permissions to the frontend (no access_token in body)
    return reply.code(200).send({ status: 'authenticated', user, permissions });
  });

  // ── GET /auth/me ─────────────────────────────────────────────────────────
  // Returns the current session's user + permissions without hitting C++.
  // Used by the frontend AuthContext on mount to restore session state.

  fastify.get('/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = getCookie(request, SESSION_COOKIE);
    if (!sessionId) return reply.code(401).send({ error: 'Unauthorized' });

    const session = sessionStore.get(sessionId);
    if (!session) return reply.code(401).send({ error: 'Session expired or not found' });

    return reply.code(200).send({ user: session.user, permissions: session.permissions });
  });

  // ── POST /auth/setup/claim — Step 1 ──────────────────────────────────────
  // Claims the invite token from the setup URL and sets a permanent password.

  fastify.post('/auth/setup/claim', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = SetupClaimSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const result = await nexriskFetch<SetupClaimResponse>('/api/v1/auth/setup/claim', {
      method: 'POST',
      body: parsed.data,
    });

    if (!result.ok) return reply.code(result.status).send(result.error);

    const { enrollment_token, status, message } = result.data!;

    // Store enrollment_token in a BFF-side setup session.
    // NEVER return it to the browser — it lives only on the BFF.
    const setupSessionId = sessionStore.create({
      accessToken: '',
      user: { id: '', email: '', role: '', role_label: '', can_trade: false },
      permissions: {},
      enrollmentToken: enrollment_token,
    });

    setSetupCookie(reply, setupSessionId);

    // Return status + message only — enrollment_token is withheld from the client
    return reply.code(200).send({ status, message });
  });

  // ── GET /auth/setup/totp — Step 2 ────────────────────────────────────────
  // Generates the TOTP secret and returns a QR code image (base64 PNG data URI).

  fastify.get('/auth/setup/totp', async (request: FastifyRequest, reply: FastifyReply) => {
    const setupSessionId = getCookie(request, SETUP_COOKIE);
    if (!setupSessionId) {
      return reply.code(401).send({ error: 'Setup session not found. Complete step 1 first.' });
    }

    const setupSession = sessionStore.get(setupSessionId);
    if (!setupSession?.enrollmentToken) {
      clearSetupCookie(reply);
      return reply.code(401).send({
        error: 'Enrollment token missing or expired. Restart the setup process.',
      });
    }

    const result = await nexriskFetch<SetupTotpResponse>('/api/v1/auth/setup/totp', {
      method: 'GET',
      headers: { 'X-Enrollment-Token': setupSession.enrollmentToken },
    });

    if (!result.ok) return reply.code(result.status).send(result.error);

    const { qr_uri, secret, status, message } = result.data!;

    // Convert the otpauth:// URI to a QR code PNG data URI server-side.
    // The raw qr_uri is NOT returned to the client (it contains the TOTP secret in the URL).
    const qrDataUri = await toQrDataUri(qr_uri);

    return reply.code(200).send({
      status,
      message,
      qr_data_uri: qrDataUri, // base64 PNG for <img src="...">
      secret,                  // plain-text fallback for manual entry
    });
  });

  // ── POST /auth/setup/totp/verify — Step 3 ────────────────────────────────
  // Verifies the first TOTP code, completes enrollment, issues full session.

  fastify.post('/auth/setup/totp/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const setupSessionId = getCookie(request, SETUP_COOKIE);
    if (!setupSessionId) {
      return reply.code(401).send({ error: 'Setup session not found. Complete step 1 first.' });
    }

    const setupSession = sessionStore.get(setupSessionId);
    if (!setupSession?.enrollmentToken) {
      clearSetupCookie(reply);
      return reply.code(401).send({
        error: 'Enrollment token missing or expired. Restart the setup process.',
      });
    }

    const parsed = TotpVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'code must be a 6-digit string',
      });
    }

    const result = await nexriskFetch<LoginResponse>('/api/v1/auth/setup/totp/verify', {
      method: 'POST',
      body: {
        enrollment_token: setupSession.enrollmentToken,
        code: parsed.data.code,
      },
    });

    if (!result.ok) return reply.code(result.status).send(result.error);

    const { access_token, user, permissions } = result.data!;

    // Enrollment complete — destroy the setup session and its cookie
    sessionStore.delete(setupSessionId);
    clearSetupCookie(reply);

    // Create the full authenticated session
    const sessionId = sessionStore.create({ accessToken: access_token, user, permissions });
    setMainSessionCookie(reply, sessionId);

    // Forward the refresh cookie from C++
    forwardRefreshCookie(result.setCookies, reply);

    return reply.code(200).send({ status: 'authenticated', user, permissions });
  });

  // ── POST /auth/refresh ────────────────────────────────────────────────────
  // Silently refreshes the access token using the HttpOnly refresh cookie.
  // The browser sends nexrisk_refresh automatically on this path.

  fastify.post('/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = getCookie(request, SESSION_COOKIE);
    if (!sessionId) return reply.code(401).send({ error: 'Unauthorized' });

    const session = sessionStore.get(sessionId);
    if (!session) return reply.code(401).send({ error: 'Session not found' });

    // Forward the nexrisk_refresh HttpOnly cookie to the C++ service
    const refreshCookieValue = getCookie(request, 'nexrisk_refresh');
    if (!refreshCookieValue) {
      sessionStore.delete(sessionId);
      clearMainSessionCookie(reply);
      return reply.code(401).send({ error: 'Refresh token not found. Please log in again.' });
    }

    const result = await nexriskFetch<RefreshResponse>('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `nexrisk_refresh=${refreshCookieValue}` },
    });

    if (!result.ok) {
      // Refresh failed — session is dead. Clear everything.
      sessionStore.delete(sessionId);
      clearMainSessionCookie(reply);
      return reply.code(401).send({ error: 'Session expired. Please log in again.' });
    }

    // Update the BFF session with the new access token
    sessionStore.update(sessionId, { accessToken: result.data!.access_token });

    // Forward the potentially-rotated refresh cookie
    forwardRefreshCookie(result.setCookies, reply);

    return reply.code(200).send({ status: 'refreshed' });
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────────

  fastify.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = getCookie(request, SESSION_COOKIE);
    if (sessionId) {
      const session = sessionStore.get(sessionId);
      if (session?.accessToken) {
        // Best-effort revocation on C++ — fire and forget on failure
        await nexriskFetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }).catch(() => {/* swallow — session is being destroyed regardless */});
      }
      sessionStore.delete(sessionId);
    }

    clearMainSessionCookie(reply);
    reply.clearCookie('nexrisk_refresh', { path: '/api/v1/auth/refresh' });

    return reply.code(200).send({ status: 'logged_out' });
  });

  // ── POST /auth/change-password ────────────────────────────────────────────
  // Root-account first-login password change. No session required.
  // No invite token, no TOTP. Validates current password then sets the new one.

  const ChangePasswordSchema = z.object({
    email: z.string().email(),
    current_password: z.string().min(1),
    new_password: z.string().min(10, 'New password must be at least 10 characters'),
  });

  fastify.post('/auth/change-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ChangePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const result = await nexriskFetch<{
      status: string;
      is_root: boolean;
      role: string;
      message: string;
    }>('/api/v1/auth/change-password', {
      method: 'POST',
      body: parsed.data,
    });

    if (!result.ok) return reply.code(result.status).send(result.error);
    return reply.code(200).send(result.data);
  });

  // ── POST /auth/forgot-password ───────────────────────────────────────────
  // Generates a reset token and emails the reset link.
  // Always returns 200 regardless of whether the email exists (prevents enumeration).

  const ForgotPasswordSchema = z.object({
    email: z.string().email(),
  });

  fastify.post('/auth/forgot-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ForgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const result = await nexriskFetch<{
      status: string;
      reset_token?: string;
      expires_at?: string;
      message: string;
    }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: parsed.data,
    });

    // Always return 200 to the frontend — never reveal whether the email exists
    if (!result.ok && result.status !== 200) {
      // Log the error internally but return success to prevent enumeration
      fastify.log.warn({ email: parsed.data.email, status: result.status }, 'forgot-password C++ error');
      return reply.code(200).send({ status: 'RESET_TOKEN_ISSUED', message: 'If that email exists, a reset link will be sent.' });
    }

    const data = result.data!;

    // Only send email if a reset_token was actually issued
    if (data.reset_token) {
      try {
        await sendPasswordResetEmail(parsed.data.email, data.reset_token);
        fastify.log.info({ email: parsed.data.email }, 'Password reset email dispatched');
      } catch (err) {
        fastify.log.error({ err, email: parsed.data.email }, 'Failed to send password reset email');
      }
    }

    // Return generic message regardless — token never exposed to client
    return reply.code(200).send({
      status: 'RESET_TOKEN_ISSUED',
      message: 'If that email exists, a reset link will be sent.',
    });
  });

  // ── POST /auth/reset-password ─────────────────────────────────────────────
  // Consumes a reset token and sets a new password. No current password required.
  // User is NOT logged in on success — must return to /login.

  const ResetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    new_password: z.string().min(10, 'Password must be at least 10 characters'),
  });

  fastify.post('/auth/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ResetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const result = await nexriskFetch<{
      status: string;
      message: string;
    }>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: parsed.data,
    });

    if (!result.ok) return reply.code(result.status).send(result.error);
    return reply.code(200).send(result.data);
  });
}
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskFetch } from '../services/nexrisk-api.js';
import { sessionStore } from '../services/session-store.js';
import { sendInviteEmail } from '../services/email.js';
import { config } from '../config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  email: z.string().email(),
  role_id: z.number().int().positive(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

const UpdateUserSchema = z.object({
  role_id: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
}).refine((d) => d.role_id !== undefined || d.is_active !== undefined, {
  message: 'At least one of role_id or is_active is required',
});

const IdParams = z.object({ id: z.string().uuid() });
const RoleIdParams = z.object({ id: z.coerce.number().int().positive() });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'nexrisk_session';

function getAccessToken(request: FastifyRequest): string | undefined {
  const sessionId = (request.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
  if (!sessionId) return undefined;
  return sessionStore.get(sessionId)?.accessToken;
}

/** Standard auth header for protected C++ calls */
function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Extracts invite_token from user-creation response and triggers email. Logs errors, never throws. */
async function dispatchInviteEmail(
  log: FastifyInstance['log'],
  userEmail: string,
  inviteToken: string,
): Promise<void> {
  try {
    await sendInviteEmail(userEmail, inviteToken);
    log.info({ email: userEmail }, 'Invite email dispatched');
  } catch (err) {
    // Email failure must not fail the HTTP response — the token was already issued.
    // The admin can reissue via POST /users/:id/invite if needed.
    log.error({ err, email: userEmail }, 'Failed to send invite email');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Session guard — all users/roles routes require an active session ──────

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    if (!sessionId) return reply.code(401).send({ error: 'Unauthorized' });
    const session = sessionStore.get(sessionId);
    if (!session) return reply.code(401).send({ error: 'Session expired' });
    // Attach to request for downstream use
    (request as FastifyRequest & { _session: typeof session })._session = session;
  });

  // ── POST /users — Create user + dispatch invite email ────────────────────

  fastify.post('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getAccessToken(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    const parsed = CreateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const result = await nexriskFetch<{
      user: { id: string; email: string; role: string; is_active: boolean };
      invite_token: string;
      invite_expires_at: string;
    }>('/api/v1/users', {
      method: 'POST',
      body: parsed.data,
      headers: authHeaders(token),
    });

    if (!result.ok) return reply.code(result.status).send(result.error);

    const { user, invite_token, invite_expires_at } = result.data!;

    // Dispatch invite email immediately — token expires in 24 hours.
    // invite_token is NEVER stored or logged; it goes directly to the email function.
    await dispatchInviteEmail(fastify.log, user.email, invite_token);

    // Return user info and expiry to the admin — but NOT the raw invite_token
    return reply.code(201).send({
      user,
      invite_expires_at,
      invite_sent: true,
      message: `Setup invitation sent to ${user.email}`,
    });
  });

  // ── GET /users — List all users ───────────────────────────────────────────

  fastify.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getAccessToken(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    const result = await nexriskFetch('/api/v1/users', {
      method: 'GET',
      headers: authHeaders(token),
    });

    if (!result.ok) return reply.code(result.status).send(result.error);
    return reply.code(200).send(result.data);
  });

  // ── GET /users/:id — Single user ─────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid user ID' });
    }

    const token = getAccessToken(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    const result = await nexriskFetch(`/api/v1/users/${params.data.id}`, {
      method: 'GET',
      headers: authHeaders(token),
    });

    if (!result.ok) return reply.code(result.status).send(result.error);
    return reply.code(200).send(result.data);
  });

  // ── PATCH /users/:id — Update role or active status ──────────────────────

  fastify.patch<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid user ID' });
    }

    const parsed = UpdateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const token = getAccessToken(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    const result = await nexriskFetch(`/api/v1/users/${params.data.id}`, {
      method: 'PATCH',
      body: parsed.data,
      headers: authHeaders(token),
    });

    if (!result.ok) return reply.code(result.status).send(result.error);
    return reply.code(200).send(result.data);
  });

  // ── DELETE /users/:id — Deactivate user (soft delete) ────────────────────

  fastify.delete<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid user ID' });
    }

    const token = getAccessToken(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    const result = await nexriskFetch(`/api/v1/users/${params.data.id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });

    if (!result.ok) return reply.code(result.status).send(result.error);
    return reply.code(200).send(result.data);
  });

  // ── POST /users/:id/invite — Reissue invite token ────────────────────────

  fastify.post<{ Params: { id: string } }>('/users/:id/invite', async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid user ID' });
    }

    const token = getAccessToken(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    // Fetch user first to get their email — new C++ response shape omits it
    const userResult = await nexriskFetch<{
      id: string; email: string;
    }>(`/api/v1/users/${params.data.id}`, {
      method: 'GET',
      headers: authHeaders(token),
    });

    if (!userResult.ok) return reply.code(userResult.status).send(userResult.error);
    const userEmail = userResult.data!.email;

    // Issue / re-issue invite token — works for both enrolled and non-enrolled users
    const result = await nexriskFetch<{
      invite_token: string;
      invite_expires_at: string;
      user_id: string;
      message: string;
    }>(`/api/v1/users/${params.data.id}/invite`, {
      method: 'POST',
      headers: authHeaders(token),
    });

    if (!result.ok) return reply.code(result.status).send(result.error);

    const { invite_token, invite_expires_at, message } = result.data!;

    // Dispatch invite email — token is NEVER returned to the API caller
    await dispatchInviteEmail(fastify.log, userEmail, invite_token);

    return reply.code(200).send({
      user: { id: params.data.id, email: userEmail },
      invite_expires_at,
      invite_sent: true,
      message: `${message ?? 'Setup invitation sent'} — email dispatched to ${userEmail}`,
    });
  });

  // ── GET /roles — List all roles ───────────────────────────────────────────

  fastify.get('/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getAccessToken(request);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    const result = await nexriskFetch('/api/v1/roles', {
      method: 'GET',
      headers: authHeaders(token),
    });

    if (!result.ok) return reply.code(result.status).send(result.error);
    return reply.code(200).send(result.data);
  });

  // ── GET /roles/:id/permissions — Permission matrix for a role ────────────

  fastify.get<{ Params: { id: string } }>(
    '/roles/:id/permissions',
    async (request, reply) => {
      const params = RoleIdParams.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Invalid role ID' });
      }

      const token = getAccessToken(request);
      if (!token) return reply.code(401).send({ error: 'Unauthorized' });

      const result = await nexriskFetch(`/api/v1/roles/${params.data.id}/permissions`, {
        method: 'GET',
        headers: authHeaders(token),
      });

      if (!result.ok) return reply.code(result.status).send(result.error);
      return reply.code(200).send(result.data);
    },
  );
}
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { User, Role, Capability } from '../types/index.js';
import { config } from '../config.js';
import { getCapabilitiesForRole, mapCppRole } from './rbac.js';
import { sessionStore } from '../services/session-store.js';

// Extend FastifyRequest to include our custom user type
declare module 'fastify' {
  interface FastifyRequest {
    nexriskUser?: User;
  }
}

/**
 * Mock user for development when auth is disabled (AUTH_ENABLED env var
 * unset or not 'true'). Bypasses the session-store lookup entirely.
 * Do NOT ship to production — any request hitting an authenticated route
 * silently authenticates as this user regardless of actual identity.
 */
const MOCK_USER: User = {
  id: 'dev-user',
  email: 'dev@nexrisk.local',
  name: 'Development User',
  role: 'risk_admin',
  capabilities: getCapabilitiesForRole('risk_admin'),
};

/**
 * Name of the BFF session cookie created by POST /auth/login and cleared
 * by POST /auth/logout. Mirrors SESSION_COOKIE in src/routes/auth.ts —
 * kept as a local constant to avoid pulling the route module into this
 * middleware's dependency graph.
 */
const SESSION_COOKIE = 'nexrisk_session';

/**
 * Assemble a human-readable operator display name from the session user.
 * C++ login responses include first_name and last_name since lines 677-678
 * of AuthEndpoint.cpp; older sessions or setup-flow sessions may not carry
 * them, so fall back to email.
 */
function displayNameFromSessionUser(user: {
  first_name?: string;
  last_name?: string;
  email: string;
}): string {
  const first = user.first_name?.trim() ?? '';
  const last = user.last_name?.trim() ?? '';
  const full = [first, last].filter(Boolean).join(' ');
  return full || user.email;
}

/**
 * Register authentication plugin
 */
export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  // Register JWT plugin. The BFF no longer calls `request.jwtVerify()` on
  // incoming requests (auth is session-based, not bearer-based) — this
  // registration is retained so other code paths that may need JWT decode
  // or sign capabilities still have access to them.
  await fastify.register(import('@fastify/jwt'), {
    secret: config.jwtSecret,
    decode: { complete: true },
    sign: { algorithm: 'HS256' },
  });

  // Add authenticate decorator
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      // Dev bypass — skip the session lookup entirely.
      if (!config.authEnabled) {
        request.nexriskUser = MOCK_USER;
        return;
      }

      // The browser holds only the opaque session ID. The JWT and user
      // identity live in the server-side sessionStore, keyed by that ID.
      const sessionId = request.cookies?.[SESSION_COOKIE];
      if (!sessionId) {
        return reply.code(401).send({
          error: 'Unauthorized',
          details: 'No session cookie',
        });
      }

      // sessionStore.get() handles TTL expiry (8h since last access) and
      // refreshes lastAccessedAt. A missing or expired session returns undefined.
      const session = sessionStore.get(sessionId);
      if (!session) {
        return reply.code(401).send({
          error: 'Unauthorized',
          details: 'Session expired or invalid',
        });
      }

      // Guard against partially-initialised setup-flow sessions landing on
      // a protected route. These have an empty-string user populated while
      // the TOTP enrollment is in progress, and should not satisfy auth.
      if (!session.user.id) {
        return reply.code(401).send({
          error: 'Unauthorized',
          details: 'Session not fully authenticated',
        });
      }

      const role = mapCppRole(session.user.role);
      request.nexriskUser = {
        id: session.user.id,
        email: session.user.email,
        name: displayNameFromSessionUser(session.user),
        role,
        capabilities: getCapabilitiesForRole(role),
      };
    }
  );

  // Add capability check decorator
  fastify.decorate('requireCapability', function (capability: Capability) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.nexriskUser) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      if (!request.nexriskUser.capabilities.includes(capability)) {
        return reply.code(403).send({
          error: 'Forbidden',
          details: `Missing required capability: ${capability}`,
        });
      }
    };
  });

  // Add role check decorator
  fastify.decorate('requireRole', function (roles: Role | Role[]) {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.nexriskUser) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      if (!allowedRoles.includes(request.nexriskUser.role)) {
        return reply.code(403).send({
          error: 'Forbidden',
          details: `Required role: ${allowedRoles.join(' or ')}`,
        });
      }
    };
  });
}

// Type augmentation for decorators
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireCapability: (
      capability: Capability
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      roles: Role | Role[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
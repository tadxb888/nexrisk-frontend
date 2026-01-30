import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { User, Role, Capability } from '../types/index.js';
import { config } from '../config.js';
import { getCapabilitiesForRole } from './rbac.js';

// Extend FastifyRequest to include our custom user type
declare module 'fastify' {
  interface FastifyRequest {
    nexriskUser?: User;
  }
}

/**
 * Mock user for development when auth is disabled
 */
const MOCK_USER: User = {
  id: 'dev-user',
  email: 'dev@nexrisk.local',
  name: 'Development User',
  role: 'risk_admin',
  capabilities: getCapabilitiesForRole('risk_admin'),
};

/**
 * Register authentication plugin
 */
export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  // Register JWT plugin
  await fastify.register(import('@fastify/jwt'), {
    secret: config.jwtSecret,
    decode: { complete: true },
    sign: { algorithm: 'HS256' },
  });

  // Add authenticate decorator
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      // If auth is disabled, use mock user
      if (!config.authEnabled) {
        request.nexriskUser = MOCK_USER;
        return;
      }

      try {
        // Verify JWT token
        const decoded = await request.jwtVerify<{
          sub: string;
          email: string;
          name: string;
          role: Role;
        }>();

        // Build user object with capabilities
        request.nexriskUser = {
          id: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role,
          capabilities: getCapabilitiesForRole(decoded.role),
        };
      } catch (_err) {
        reply.code(401).send({ error: 'Unauthorized', details: 'Invalid or expired token' });
      }
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

import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  timestamp: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  path: string;
  statusCode: number;
  ip: string;
  userAgent?: string;
  duration: number;
  details?: Record<string, unknown>;
}

/**
 * Actions that should be audit logged
 */
const AUDIT_ACTIONS: Record<string, string> = {
  'PUT /api/alerts/:alertId/acknowledge': 'alerts.acknowledge',
  'PUT /api/alerts/:alertId/resolve': 'alerts.resolve',
  'POST /api/explanations/trader/:login/generate': 'explanation.generate',
  'POST /api/clustering/run': 'clustering.run',
  'PUT /api/clustering/config': 'clustering.config.update',
  'PUT /api/config/risk-matrix': 'risk_matrix.update',
};

/**
 * Determine if a request should be audit logged
 */
function shouldAuditLog(method: string, path: string): boolean {
  // Always log write operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return true;
  }
  
  // Log specific read operations on sensitive resources
  if (method === 'GET' && path.includes('/explanations/')) {
    return true;
  }

  return false;
}

/**
 * Get action name for audit log
 */
function getActionName(method: string, routePath: string): string {
  const key = `${method} ${routePath}`;
  return AUDIT_ACTIONS[key] ?? `${method.toLowerCase()}.${routePath.split('/').filter(Boolean).join('.')}`;
}

/**
 * Extract resource ID from path parameters
 */
function extractResourceId(params: Record<string, unknown>): string | undefined {
  // Common parameter names for resource IDs
  const idParams = ['alertId', 'login', 'runId', 'ruleId'];
  for (const param of idParams) {
    if (params[param]) {
      return String(params[param]);
    }
  }
  return undefined;
}

/**
 * Register audit logging hooks
 */
export async function registerAuditLog(fastify: FastifyInstance): Promise<void> {
  // Add request timing
  fastify.addHook('onRequest', async (request) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  // Log after response is sent
  fastify.addHook('onResponse', async (request, reply) => {
    const method = request.method;
    const path = request.url;
    const routePath = request.routeOptions?.url ?? path;

    if (!shouldAuditLog(method, path)) {
      return;
    }

    const startTime = (request as FastifyRequest & { startTime?: number }).startTime ?? Date.now();
    const duration = Date.now() - startTime;

    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      userId: request.nexriskUser?.id ?? 'anonymous',
      userEmail: request.nexriskUser?.email ?? 'unknown',
      userRole: request.nexriskUser?.role ?? 'unknown',
      action: getActionName(method, routePath),
      resource: routePath.split('/')[2] ?? 'unknown', // e.g., 'alerts', 'traders'
      resourceId: extractResourceId(request.params as Record<string, unknown>),
      method,
      path,
      statusCode: reply.statusCode,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      duration,
    };

    // Add request body details for write operations (excluding sensitive fields)
    if (['POST', 'PUT', 'PATCH'].includes(method) && request.body) {
      const sanitizedBody = sanitizeBody(request.body as Record<string, unknown>);
      if (Object.keys(sanitizedBody).length > 0) {
        entry.details = sanitizedBody;
      }
    }

    // Log to structured logger (will go to journald/stdout in production)
    fastify.log.info({ audit: entry }, `AUDIT: ${entry.action} by ${entry.userEmail}`);
  });
}

/**
 * Sanitize request body for audit logging
 * Removes sensitive fields and truncates large values
 */
function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    // Skip sensitive fields
    if (sensitiveFields.some((f) => key.toLowerCase().includes(f))) {
      result[key] = '[REDACTED]';
      continue;
    }

    // Truncate long strings
    if (typeof value === 'string' && value.length > 200) {
      result[key] = value.substring(0, 200) + '...[truncated]';
      continue;
    }

    // Include primitives and small objects
    if (typeof value !== 'object' || value === null) {
      result[key] = value;
    }
  }

  return result;
}

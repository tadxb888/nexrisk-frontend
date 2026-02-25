import Fastify from 'fastify';
import { config } from './config.js';
import { registerAuth } from './middleware/auth.js';
import { registerAuditLog } from './middleware/audit.js';
import { registerWebSocket, getWSStats } from './websocket/handler.js';
import { healthRoutes } from './routes/health.js';
import { tradersRoutes } from './routes/traders.js';
import { alertsRoutes } from './routes/alerts.js';
import { explanationsRoutes } from './routes/explanations.js';
import { positionsRoutes, ordersRoutes } from './routes/positions-orders.js';
import { clusteringRoutes } from './routes/clustering.js';
import { checkNexRiskHealth } from './services/nexrisk-api.js';
import { riskMatrixRoutes } from './routes/risk-matrix.js';
import { settingsRoutes } from './routes/settings.js';

/**
 * Create and configure Fastify server
 */
async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    trustProxy: true, // Trust Nginx proxy headers
  });

  // =========================================================================
  // Global Plugins
  // =========================================================================

  // CORS
  await fastify.register(import('@fastify/cors'), {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // Security headers
  await fastify.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false, // Let frontend handle CSP
  });

  // Rate limiting
  await fastify.register(import('@fastify/rate-limit'), {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise IP
      return request.nexriskUser?.id ?? request.ip;
    },
  });

  // Cookie support (for auth tokens)
  await fastify.register(import('@fastify/cookie'));

  // =========================================================================
  // Authentication & Authorization
  // =========================================================================

  await registerAuth(fastify);

  // =========================================================================
  // Audit Logging
  // =========================================================================

  await registerAuditLog(fastify);

  // =========================================================================
  // Error Handling
  // =========================================================================

  fastify.setErrorHandler(async (error, request, reply) => {
    // Log error
    fastify.log.error({
      err: error,
      url: request.url,
      method: request.method,
      user: request.nexriskUser?.email,
    });

    // Zod validation errors
    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error: 'Validation error',
        details: (error as unknown as { issues: unknown[] }).issues,
      });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return reply.code(429).send({
        error: 'Too many requests',
        details: 'Please slow down and try again later',
      });
    }

    // Default error response
    const statusCode = error.statusCode ?? 500;
    const message =
      statusCode >= 500 ? 'Internal server error' : error.message ?? 'Unknown error';

    return reply.code(statusCode).send({
      error: message,
      ...(config.nodeEnv === 'development' && { stack: error.stack }),
    });
  });

  // =========================================================================
  // Routes
  // =========================================================================

  // Health routes (no /api prefix)
  await fastify.register(healthRoutes);

  // API routes
  await fastify.register(
    async (api) => {
      await api.register(tradersRoutes);
      await api.register(alertsRoutes);
      await api.register(explanationsRoutes);
      await api.register(positionsRoutes);
      await api.register(ordersRoutes);
      await api.register(clusteringRoutes);
      await api.register(riskMatrixRoutes);
      await api.register(settingsRoutes); 
    },
    { prefix: '/api/v1' } 
  );

  // =========================================================================
  // WebSocket
  // =========================================================================

  await registerWebSocket(fastify);

  // WebSocket stats endpoint (for monitoring)
  fastify.get(
    '/api/ws/stats',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('llm.status')],
    },
    async () => {
      return getWSStats();
    }
  );

  return fastify;
}

/**
 * Start server
 */
async function start() {
  const fastify = await buildServer();

  try {
    // Check NexRisk API connectivity on startup
    const apiHealthy = await checkNexRiskHealth();
    if (!apiHealthy) {
      fastify.log.warn('NexRisk C++ API is not reachable at startup');
    }

    // Start server
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    fastify.log.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 NexRisk BFF Server Started                           ║
║                                                           ║
║   REST API:    http://${config.host}:${config.port}/api   ║
║   WebSocket:   ws://${config.host}:${config.port}/ws      ║
║   Health:      http://${config.host}:${config.port}/health║
║                                                           ║
║   Backend API: ${config.nexriskApiUrl}                    ║
║   Auth:        ${config.authEnabled ? 'Enabled' : 'Disabled (dev mode)'}
║   Environment: ${config.nodeEnv}                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Start the server
start();

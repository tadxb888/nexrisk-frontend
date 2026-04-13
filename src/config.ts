import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file in development
dotenv.config();

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(8080),
  host: z.string().default('127.0.0.1'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // NexRisk API
  nexriskApiUrl: z.string().url().default('http://127.0.0.1:8090'),
  nexriskApiTimeoutMs: z.coerce.number().default(30000),

  // Authentication
  authEnabled: z.string().optional().transform((val) => val?.toLowerCase() === 'true'),
  authIssuerUrl: z.string().optional(),
  authClientId: z.string().optional(),
  authAudience: z.string().optional(),
  jwtSecret: z.string().default('dev-secret-change-in-production'),

  /**
   * Shared secret between this BFF and the C++ nexrisk_service.
   * Injected as X-Internal-Secret on every BFF → C++ request.
   * Must match NEXRISK_INTERNAL_SECRET on the C++ side exactly.
   */
  internalSecret: z.string().default('dev-internal-secret-change-in-production'),

  // CORS
  corsOrigins: z
    .string()
    .transform((s) => s.split(',').map((o) => o.trim()))
    .default('http://localhost:5173'),

  // Rate Limiting
  rateLimitMax: z.coerce.number().default(100),
  rateLimitWindowMs: z.coerce.number().default(60000),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // WebSocket
  wsHeartbeatIntervalMs: z.coerce.number().default(30000),
  wsMaxConnectionsPerUser: z.coerce.number().default(5),

  // SMTP — invite email delivery
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().default('noreply@nexrisk.io'),

  // Frontend — used to build invite setup links
  frontendUrl: z.string().url().default('http://localhost:5174'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const rawConfig = {
    port: process.env.PORT,
    host: process.env.HOST,
    nodeEnv: process.env.NODE_ENV,
    nexriskApiUrl: process.env.NEXRISK_API_URL,
    nexriskApiTimeoutMs: process.env.NEXRISK_API_TIMEOUT_MS,
    authEnabled: process.env.AUTH_ENABLED,
    authIssuerUrl: process.env.AUTH_ISSUER_URL,
    authClientId: process.env.AUTH_CLIENT_ID,
    authAudience: process.env.AUTH_AUDIENCE,
    jwtSecret: process.env.JWT_SECRET,
    internalSecret: process.env.NEXRISK_INTERNAL_SECRET,
    corsOrigins: process.env.CORS_ORIGINS,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    logLevel: process.env.LOG_LEVEL,
    wsHeartbeatIntervalMs: process.env.WS_HEARTBEAT_INTERVAL_MS,
    wsMaxConnectionsPerUser: process.env.WS_MAX_CONNECTIONS_PER_USER,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
    frontendUrl: process.env.FRONTEND_URL,
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error('❌ Invalid configuration:');
    console.error(result.error.format());
    process.exit(1);
  }

  // Hard-fail in production if placeholder secrets are still in use
  if (result.data.nodeEnv === 'production') {
    if (result.data.internalSecret === 'dev-internal-secret-change-in-production') {
      console.error('❌ NEXRISK_INTERNAL_SECRET must be set in production');
      process.exit(1);
    }
    if (result.data.jwtSecret === 'dev-secret-change-in-production') {
      console.error('❌ JWT_SECRET must be set in production');
      process.exit(1);
    }
  }

  return result.data;
}

export const config = loadConfig();
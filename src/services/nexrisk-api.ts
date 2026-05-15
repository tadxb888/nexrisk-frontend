import { request, Agent } from 'undici';
import { config } from '../config.js';
import type { ApiError } from '../types/index.js';

/**
 * HTTP client for NexRisk C++ API
 * Uses undici for optimal performance
 *
 * Key guarantees:
 *  - X-Internal-Secret is injected on every request (required by C++ AuthMiddleware)
 *  - setCookies in the response lets auth routes forward Set-Cookie headers to the browser
 */

// Connection pool for keep-alive connections
const agent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 20,
  pipelining: 1,
});

export interface NexRiskRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  query?: Record<string, unknown>;
  timeout?: number;
  /** Additional headers merged into the request (e.g. Authorization, X-Enrollment-Token, Cookie) */
  headers?: Record<string, string>;
}

export interface NexRiskResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiError;
  /**
   * Raw Set-Cookie header values from the C++ response.
   * Auth routes use this to forward the nexrisk_refresh HttpOnly cookie to the browser.
   */
  setCookies?: string[];
}

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(path, config.nexriskApiUrl);
  
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  
  return url.toString();
}

/**
 * Make a request to the NexRisk C++ API.
 * X-Internal-Secret is injected automatically — never pass it manually.
 */
export async function nexriskFetch<T>(
  path: string,
  options: NexRiskRequestOptions = {}
): Promise<NexRiskResponse<T>> {
  const { method = 'GET', body, query, timeout = config.nexriskApiTimeoutMs, headers = {} } = options;

  const url = buildUrl(path, query);

  try {
    const response = await request(url, {
      method,
      headers: {
        // Required on every BFF → C++ call (see auth spec §1)
        'X-Internal-Secret': config.internalSecret,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
        // Caller-supplied headers (Authorization, X-Enrollment-Token, Cookie, etc.)
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      dispatcher: agent,
      bodyTimeout: timeout,
      headersTimeout: timeout,
    });

    const responseBody = await response.body.text();

    // Capture Set-Cookie headers so auth routes can forward them to the browser
    const rawSetCookie = response.headers['set-cookie'];
    const setCookies: string[] | undefined = rawSetCookie
      ? Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie]
      : undefined;
    
    // Try to parse JSON response
    let data: T | ApiError | undefined;
    try {
      data = JSON.parse(responseBody);
    } catch {
      // Non-JSON response
      if (response.statusCode >= 400) {
        return {
          ok: false,
          status: response.statusCode,
          error: { error: responseBody || 'Unknown error' },
          setCookies,
        };
      }
    }

    if (response.statusCode >= 400) {
      return {
        ok: false,
        status: response.statusCode,
        error: data as ApiError,
        setCookies,
      };
    }

    return {
      ok: true,
      status: response.statusCode,
      data: data as T,
      setCookies,
    };
  } catch (error) {
    // Network or timeout error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      status: 503,
      error: {
        error: 'Service unavailable',
        details: `Failed to connect to NexRisk API: ${errorMessage}`,
      },
    };
  }
}

/**
 * Convenience methods for common operations
 */
export const nexriskApi = {
  get: <T>(path: string, query?: Record<string, unknown>, headers?: Record<string, string>) =>    nexriskFetch<T>(path, { method: 'GET', query, headers }),

  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    nexriskFetch<T>(path, { method: 'POST', body, headers }),

  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    nexriskFetch<T>(path, { method: 'PUT', body, headers }),

  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    nexriskFetch<T>(path, { method: 'PATCH', body, headers }),

  delete: <T>(path: string, headers?: Record<string, string>) =>
    nexriskFetch<T>(path, { method: 'DELETE', headers }),
};

/**
 * Health check for NexRisk API
 */
export async function checkNexRiskHealth(): Promise<boolean> {
  const response = await nexriskApi.get<{ status: string }>('/health');
  return response.ok && response.data?.status === 'healthy';
}

/**
 * Convert snake_case API responses to camelCase
 */
export function snakeToCamel<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[camelKey] = snakeToCamel(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[camelKey] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? snakeToCamel(item as Record<string, unknown>)
          : item
      );
    } else {
      result[camelKey] = value;
    }
  }

  return result;
}

/**
 * Convert camelCase to snake_case for API requests
 */
export function camelToSnake<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[snakeKey] = camelToSnake(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[snakeKey] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? camelToSnake(item as Record<string, unknown>)
          : item
      );
    } else {
      result[snakeKey] = value;
    }
  }

  return result;
}
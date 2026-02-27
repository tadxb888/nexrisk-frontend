import { request, Agent } from 'undici';
import { config } from '../config.js';
import type { ApiError } from '../types/index.js';

/**
 * HTTP client for NexRisk C++ API
 * Uses undici for optimal performance
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
  query?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

export interface NexRiskResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiError;
}

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
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
 * Make a request to the NexRisk C++ API
 */
export async function nexriskFetch<T>(
  path: string,
  options: NexRiskRequestOptions = {}
): Promise<NexRiskResponse<T>> {
  const { method = 'GET', body, query, timeout = config.nexriskApiTimeoutMs } = options;

  const url = buildUrl(path, query);

  try {
    const response = await request(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      dispatcher: agent,
      bodyTimeout: timeout,
      headersTimeout: timeout,
    });

    const responseBody = await response.body.text();
    
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
        };
      }
    }

    if (response.statusCode >= 400) {
      return {
        ok: false,
        status: response.statusCode,
        error: data as ApiError,
      };
    }

    return {
      ok: true,
      status: response.statusCode,
      data: data as T,
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
  get: <T>(path: string, query?: Record<string, string | number | boolean | undefined>) =>
    nexriskFetch<T>(path, { method: 'GET', query }),

  post: <T>(path: string, body?: unknown) =>
    nexriskFetch<T>(path, { method: 'POST', body }),

  put: <T>(path: string, body?: unknown) =>
    nexriskFetch<T>(path, { method: 'PUT', body }),

  delete: <T>(path: string) =>
    nexriskFetch<T>(path, { method: 'DELETE' }),
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
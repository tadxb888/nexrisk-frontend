// ─────────────────────────────────────────────────────────────────────────────
// Global fetch override — always send session cookies on API calls.
//
// Context: the BFF authenticates via the `nexrisk_session` HttpOnly cookie
// (see src/middleware/auth.ts). For browsers to actually forward that cookie
// on a fetch() call, the request must be made with `credentials: 'include'`
// (or 'same-origin' for same-origin requests). The default is 'same-origin',
// which silently drops the cookie on any cross-origin call — including the
// localhost:5174 → localhost:8080 case during development.
//
// Rather than audit and patch ~40 fetch() call sites across ~25 page files,
// this module wraps window.fetch once at app startup and defaults every
// call to `credentials: 'include'`. Individual calls can still opt out by
// explicitly passing `credentials: 'omit'` in their init object.
//
// Import this file exactly ONCE, from src/main.tsx, before any other app code
// runs. Do not import it from library code or pages — the override must be
// globally installed before the first fetch occurs.
// ─────────────────────────────────────────────────────────────────────────────

const originalFetch = window.fetch.bind(window);

window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  return originalFetch(input, {
    ...init,
    credentials: init.credentials ?? 'include',
  });
};

export {};
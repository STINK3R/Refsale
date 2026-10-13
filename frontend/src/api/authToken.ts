/**
 * Member session token.
 *
 * The API used to identify people by a user_id sent in the request body, which
 * anyone could change. Every authenticated call now carries this signed token
 * instead. Rather than touching ~30 scattered fetch() call sites, we wrap the
 * global fetch once and attach the header to our own API requests only —
 * external hosts (DaData) never see it.
 */

const TOKEN_KEY = 'coop_token';

let token: string | null = (() => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
})();

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null | undefined): void {
  token = value || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode — in-memory token still works for this tab */ }
}

export function clearToken(): void {
  setToken(null);
}

/** True for requests aimed at our own backend. */
function isOwnApi(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin) {
      const base = import.meta.env.VITE_API_URL;
      if (!base || new URL(base, window.location.origin).origin !== resolved.origin) return false;
    }
    return resolved.pathname.startsWith('/api/') || resolved.pathname === '/api';
  } catch {
    return false;
  }
}

let installed = false;

export function installAuthFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!token) return original(input, init);
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : input.url;
    if (!isOwnApi(url)) return original(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    // Never clobber an Authorization the caller set deliberately (admin panel).
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return original(input, { ...init, headers });
  };
}

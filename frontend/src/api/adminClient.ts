/** RefSale admin API. This token is separate from the customer session token. */
const SESSION_KEY = 'admin_session';

function session(): { token?: string; ts?: number; user?: { username?: string; display_name?: string } } | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

export function adminSession() { return session(); }

export function saveAdminSession(value: { token: string; user: unknown }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...value, ts: Date.now() }));
}

export function clearAdminSession() { localStorage.removeItem(SESSION_KEY); }

export async function adminRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session()?.token;
  const headers = new Headers(init.headers || {});
  if (token && path !== '/api/admin/login') headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  const nextToken = res.headers.get('X-Admin-Token-Refresh');
  if (nextToken) {
    const current = session();
    if (current) saveAdminSession({ token: nextToken, user: current.user || {} });
  }
  if (res.status === 401 && path !== '/api/admin/login') {
    clearAdminSession();
    window.dispatchEvent(new Event('refsale:admin-expired'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка сервера (${res.status})`);
  return data as T;
}

export async function adminLogin(username: string, password: string) {
  const data = await adminRequest<{ admin: Record<string, unknown>; token: string }>('/api/admin/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  });
  if (data.token) saveAdminSession({ token: data.token, user: data.admin });
  return data;
}

export async function adminUpload(file: File, prefix = 'admin') {
  const form = new FormData();
  form.append('file', file);
  form.append('prefix', prefix);
  return adminRequest<{ url: string }>('/api/admin/upload', { method: 'POST', body: form });
}

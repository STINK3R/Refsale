import type { Category, Subcategory, Product, User, Order, Review } from '../types';
import { setToken } from './authToken';

export const API_BASE = import.meta.env.VITE_API_URL || '';

async function _api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Ошибка сервера');
  }
  return res.json();
}

function _post<T = unknown>(path: string, body: unknown): Promise<T> {
  return _api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function _patch<T = unknown>(path: string, body: unknown): Promise<T> {
  return _api<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ==================== SETTINGS ====================
export async function fetchSettings(): Promise<Record<string, string>> {
  return _api<Record<string, string>>('/api/settings').catch(() => ({}));
}

export async function loginUser(email: string, password: string): Promise<{ user?: User; error?: string }> {
  try {
    const res = await _post<{ user?: User; token?: string }>('/api/login', { email, password });
    if (res.token) setToken(res.token);
    return res;
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

export async function updateUser(id: number, updates: Partial<User & { password?: string }>): Promise<{ user?: User; error?: string }> {
  try {
    // Changing the password invalidates every older token, so the server hands
    // back a fresh one to keep this session alive.
    const res = await _patch<{ user?: User; token?: string }>(`/api/user/${id}`, updates);
    if (res.token) setToken(res.token);
    return res;
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

export async function fetchUserById(id: number): Promise<User | null> {
  try {
    const d = await _api<{ user: User }>(`/api/user/${id}`);
    return d.user || null;
  } catch {
    return null;
  }
}

export async function forgotPassword(email: string): Promise<{ success?: boolean; error?: string }> {
  try {
    return await _post('/api/forgot-password', { email });
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

export async function resetPassword(token: string, new_password: string): Promise<{ success?: boolean; error?: string }> {
  try {
    return await _post('/api/reset-password', { token, new_password });
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ==================== REVIEWS ====================
export async function fetchReviews(categoryId?: number | null): Promise<Review[]> {
  try {
    return await _api(categoryId ? `/api/reviews?category_id=${categoryId}` : '/api/reviews');
  } catch {
    return [];
  }
}

export async function addReview(review: { user_id: number; text: string; rating: number; images?: string[]; category_id?: number | null }): Promise<Review | null> {
  try {
    return await _post('/api/reviews', review);
  } catch {
    return null;
  }
}

export async function uploadFile(file: File, prefix: string, userId?: number): Promise<string | null> {
  const form = new FormData();
  form.append('file', file);
  form.append('prefix', prefix);
  // If userId provided, use the public authenticated endpoint (for sellers, etc.);
  // otherwise fall back to the admin endpoint.
  const endpoint = userId ? '/api/upload' : '/api/admin/upload';
  if (userId) form.append('user_id', String(userId));
  try {
    const d = await _api<{ url: string }>(endpoint, { method: 'POST', body: form });
    return d.url || null;
  } catch {
    return null;
  }
}

// ==================== SUPPORT ====================
export async function createSupportTicket(data: { user_id: number; user_name: string; subject: string; text: string; product_id?: number | null; images?: string[]; promo_code?: string | null }): Promise<unknown> {
  return _post('/api/support/tickets', data);
}

export async function fetchUserTickets(userId: number): Promise<import('../types').SupportTicket[]> {
  try { return await _api(`/api/support/tickets/${userId}`); } catch { return []; }
}

export async function fetchTicketMessages(ticketId: number): Promise<import('../types').SupportMessage[]> {
  try { return await _api(`/api/support/tickets/${ticketId}/messages`); } catch { return []; }
}

export async function sendTicketMessage(ticketId: number, data: { sender_type: string; sender_name: string; text: string; images?: string[] }): Promise<unknown> {
  return _post(`/api/support/tickets/${ticketId}/messages`, data);
}

export async function fetchSupportUnreadCount(userId: number): Promise<number> {
  try { const d = await _api<{ count: number }>(`/api/support/unread-count/${userId}`); return d.count || 0; } catch { return 0; }
}

// ==================== ORDER CHAT ====================
export async function fetchUserOrderChats(userId: number): Promise<import('../types').OrderChatSummary[]> {
  try { return await _api(`/api/user/${userId}/order-chats`); } catch { return []; }
}

export async function fetchOrderMessages(orderId: number, userId: number): Promise<{ messages: import('../types').OrderChatMessage[]; status: string | null }> {
  try { return await _api(`/api/orders/${orderId}/messages?user_id=${userId}`); } catch { return { messages: [], status: null }; }
}

export async function sendOrderMessage(orderId: number, data: { user_id: number; sender_name: string; text: string; images?: string[] }): Promise<import('../types').OrderChatMessage> {
  return _post(`/api/orders/${orderId}/messages`, data);
}

export async function fetchOrderChatsUnread(userId: number): Promise<number> {
  try { const d = await _api<{ count: number }>(`/api/user/${userId}/order-chats/unread-count`); return d.count || 0; } catch { return 0; }
}

// ==================== STOREFRONT ====================
export interface Catalog {
  categories: Category[];
  subcategories: Subcategory[];
  products: Product[];
}

export async function fetchCatalog(): Promise<Catalog> {
  try {
    const d = await _api<Catalog>('/api/store/catalog');
    return { categories: d.categories || [], subcategories: d.subcategories || [], products: d.products || [] };
  } catch {
    return { categories: [], subcategories: [], products: [] };
  }
}

export interface PromoResult {
  valid?: boolean;
  code?: string;
  label?: string;
  leader_name?: string;
  /** ISO date the code stops working, null when it has no end date */
  expires_at?: string | null;
  /** product id (or "v" + variant id) → price for promo-code holders */
  prices?: Record<string, number>;
  error?: string;
}

export async function validateStorePromo(code: string): Promise<PromoResult> {
  try {
    return await _post<PromoResult>('/api/store/promo/validate', { code });
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

export async function storeRegister(data: { full_name: string; email: string; password: string; phone?: string }): Promise<{ user?: User; error?: string; exists?: boolean }> {
  const res = await fetch(API_BASE + '/api/store/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({ error: 'Ошибка сервера' }));
  if (!res.ok) return { error: body.error || 'Ошибка регистрации', exists: !!body.exists };
  if (body.token) setToken(body.token);
  return { user: body.user };
}

export interface StoreOrderPayload {
  full_name: string;
  phone: string;
  address: string;
  comment?: string;
  contact_method: string;
  promo_code?: string | null;
  items: { id: number; qty: number; variant_id?: number | null; variant_comment?: string }[];
}

export async function createStoreOrder(data: StoreOrderPayload): Promise<{ order?: Order; error?: string; promo_invalid?: boolean }> {
  const res = await fetch(API_BASE + '/api/store/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({ error: 'Ошибка сервера' }));
  if (!res.ok) return { error: body.error || 'Не удалось оформить заказ', promo_invalid: !!body.promo_invalid };
  return { order: body as Order };
}

export async function cancelStoreOrder(orderId: number): Promise<{ error?: string }> {
  try {
    await _post(`/api/store/orders/${orderId}/cancel`, {});
    return {};
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ==================== OPINION LEADER CABINET ====================
export interface LeaderPromo {
  code: string;
  label: string;
  is_active: boolean;
  current_uses: number;
  max_uses: number | null;
  reward_amount: number;
  expires_at: string | null;
  orders: number;
  done: number;
}

export interface LeaderOverview {
  leader: { name: string; can_write: boolean };
  promos: LeaderPromo[];
  stats: {
    total: number; awaiting: number; in_progress: number; done: number; cancelled: number;
    revenue_done: number; reward_earned: number; reward_pending: number;
  };
}

export interface LeaderOrder {
  id: number;
  buyer: string;
  status: import('../types').OrderStatus;
  total: number;
  discount_amount: number;
  items: string;
  promo_code: string | null;
  leader_reward: number;
  created_at: string;
  confirmed_at: string | null;
  last_text: string | null;
  last_at: string | null;
  msg_count: number;
}

export interface LeaderTicket {
  id: number;
  user_name: string;
  subject: string;
  status: string;
  promo_code: string | null;
  created_at: string;
  updated_at: string;
  last_text: string | null;
}

export async function fetchLeaderOverview(): Promise<{ data?: LeaderOverview; error?: string }> {
  try { return { data: await _api<LeaderOverview>('/api/leader/overview') }; }
  catch (e: unknown) { return { error: (e as Error).message }; }
}

export async function fetchLeaderOrders(): Promise<LeaderOrder[]> {
  try { return await _api('/api/leader/orders'); } catch { return []; }
}

export async function fetchLeaderOrderMessages(orderId: number): Promise<{ messages: import('../types').OrderChatMessage[]; status: string | null; can_write: boolean }> {
  try { return await _api(`/api/leader/orders/${orderId}/messages`); }
  catch { return { messages: [], status: null, can_write: false }; }
}

export async function sendLeaderOrderMessage(orderId: number, text: string): Promise<import('../types').OrderChatMessage> {
  return _post(`/api/leader/orders/${orderId}/messages`, { text });
}

export async function setLeaderOrderStatus(orderId: number, status: string): Promise<{ error?: string }> {
  try { await _post(`/api/leader/orders/${orderId}/status`, { status }); return {}; }
  catch (e: unknown) { return { error: (e as Error).message }; }
}

export async function fetchLeaderTickets(): Promise<LeaderTicket[]> {
  try { return await _api('/api/leader/tickets'); } catch { return []; }
}

export async function fetchLeaderTicketMessages(ticketId: number): Promise<{ messages: import('../types').SupportMessage[]; can_write: boolean }> {
  try { return await _api(`/api/leader/tickets/${ticketId}/messages`); }
  catch { return { messages: [], can_write: false }; }
}

export async function sendLeaderTicketMessage(ticketId: number, text: string): Promise<import('../types').SupportMessage> {
  return _post(`/api/leader/tickets/${ticketId}/messages`, { text });
}

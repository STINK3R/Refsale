import { create } from 'zustand';
import type { Category, Subcategory, Product, ProductVariant, User, CartItem, Review } from '../types';
import { fetchCatalog, fetchSettings, fetchUserById, fetchReviews, validateStorePromo, forgetStorePromo } from '../api/client';
import { getToken, clearToken } from '../api/authToken';
import { forgetPushDevice } from './pwa';

// ==================== APP STORE ====================
interface AppState {
  categories: Category[];
  subcategories: Subcategory[];
  products: Product[];
  reviews: Review[];
  settings: Record<string, string>;
  loading: boolean;
  /** The category whose page is open: hero, products and reviews follow it.
   *  Set from the address (/catalog?c=3) by the catalog page; null while the
   *  visitor is choosing one. */
  activeCategoryId: number | null;
  setActiveCategory: (id: number | null) => void;
  loadData: () => Promise<void>;
  loadReviews: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  categories: [],
  subcategories: [],
  products: [],
  reviews: [],
  settings: {},
  loading: true,
  activeCategoryId: window.location.pathname === '/catalog'
    ? Number(new URLSearchParams(window.location.search).get('c')) || null
    : null,
  setActiveCategory: (id) => {
    if (id === get().activeCategoryId) return;
    set({ activeCategoryId: id, reviews: [] });
  },
  loadData: async () => {
    set({ loading: true });
    try {
      const [catalog, settings] = await Promise.all([fetchCatalog(), fetchSettings()]);
      set({
        categories: catalog.categories,
        subcategories: catalog.subcategories,
        products: catalog.products,
        settings,
        loading: false,
      });
      useCartStore.getState().syncWithCatalog(catalog.products);
    } catch {
      set({ loading: false });
    }
  },
  loadReviews: async () => {
    const id = get().activeCategoryId;
    const reviews = await fetchReviews(id);
    if (get().activeCategoryId === id) set({ reviews });
  },
}));

/** The open category, or undefined until the catalog has loaded. */
export function useActiveCategory(): Category | undefined {
  return useAppStore((s) => s.categories.find((c) => c.id === s.activeCategoryId));
}

// ==================== AUTH STORE ====================
interface AuthState {
  user: User | null;
  authModalOpen: boolean;
  authTab: 'login' | 'register';
  /** Why the auth modal was opened — shown above the form ("чтобы оформить заказ…"). */
  authReason: string;
  setAuthTab: (tab: 'login' | 'register') => void;
  profileModalOpen: boolean;
  forgotPasswordOpen: boolean;
  setUser: (user: User | null) => void;
  openAuth: (tab?: 'login' | 'register', reason?: string) => void;
  closeAuth: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  openForgotPassword: () => void;
  closeForgotPassword: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const USER_KEY = 'refsale_user';
const savedUser = (() => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') as User | null; } catch { return null; }
})();

// Called once auth succeeds — e.g. continue to checkout after a quick sign-up.
let afterAuth: (() => void) | null = null;
export function runAfterAuth(fn: () => void) { afterAuth = fn; }

export const useAuthStore = create<AuthState>((set, get) => ({
  user: savedUser,
  authModalOpen: false,
  authTab: 'register',
  authReason: '',
  setAuthTab: (tab) => set({ authTab: tab }),
  profileModalOpen: false,
  forgotPasswordOpen: false,
  setUser: (user) => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
    set({ user });
    if (user && afterAuth) {
      const fn = afterAuth;
      afterAuth = null;
      setTimeout(fn, 0);
    }
  },
  openAuth: (tab = 'login', reason = '') => set({ authModalOpen: true, authTab: tab, authReason: reason }),
  closeAuth: () => { afterAuth = null; set({ authModalOpen: false, authReason: '' }); },
  openProfile: () => set({ profileModalOpen: true }),
  closeProfile: () => set({ profileModalOpen: false }),
  openForgotPassword: () => set({ forgotPasswordOpen: true, authModalOpen: false }),
  closeForgotPassword: () => set({ forgotPasswordOpen: false }),
  logout: () => {
    forgetPushDevice(); // while the token is still here
    localStorage.removeItem(USER_KEY);
    clearToken();
    set({ user: null });
  },
  refreshUser: async () => {
    const { user } = get();
    if (!user?.id) return;
    if (!getToken()) {
      localStorage.removeItem(USER_KEY);
      set({ user: null });
      return;
    }
    const fresh = await fetchUserById(user.id);
    if (fresh) {
      localStorage.setItem(USER_KEY, JSON.stringify(fresh));
      set({ user: fresh });
    }
  },
}));

// ==================== PROMO STORE ====================
/** One working code: what it lowers and until when. */
export interface PromoEntry {
  code: string;
  label: string;
  leaderName: string;
  /** ISO date the code stops working; null means no end date. */
  expiresAt: string | null;
  /** product id (or "v" + variant id) → promo price, for what this code covers */
  prices: Record<string, number>;
  scope: 'all' | 'category' | 'products';
  scopeCategoryId: number | null;
  scopeProductIds: number[];
  /** What the code lowers, in words: "на весь каталог", "на категорию «Еда»" */
  scopeText: string;
}

interface PromoState {
  /** Every code on, oldest first: one per category, so a perfume code and a
   *  food code work side by side. */
  codes: PromoEntry[];
  /** The newest code — for the places that name a single one. */
  code: string | null;
  label: string;
  leaderName: string;
  expiresAt: string | null;
  scopeText: string;
  /** All codes' promo prices together, the lowest where two overlap */
  prices: Record<string, number>;
  checking: boolean;
  apply: (code: string) => Promise<{ ok: boolean; error?: string; replaced?: string }>;
  revalidate: () => Promise<void>;
  remove: (code: string) => void;
  clear: () => void;
}

const PROMO_KEY = 'refsale_promo';
const MAX_CODES = 6;

/** Codes for the same thing replace each other: one for the whole catalog,
 *  one per category, product codes each on their own. */
function slotOf(e: PromoEntry): string {
  if (e.scope === 'category') return `c${e.scopeCategoryId}`;
  if (e.scope === 'products') return `p${e.code}`;
  return 'all';
}

function toEntry(res: import('../api/client').PromoResult): PromoEntry {
  const scope = res.scope === 'category' || res.scope === 'products' ? res.scope : 'all';
  return {
    code: res.code || '',
    label: res.label || '',
    leaderName: res.leader_name || '',
    expiresAt: res.expires_at ?? null,
    prices: res.prices || {},
    scope,
    scopeCategoryId: res.scope_category_id ?? null,
    scopeProductIds: res.scope_product_ids || [],
    scopeText: scope !== 'all' ? res.scope_text || '' : '',
  };
}

function derive(codes: PromoEntry[]) {
  const prices: Record<string, number> = {};
  for (const c of codes) {
    for (const [k, v] of Object.entries(c.prices)) {
      if (prices[k] == null || v < prices[k]) prices[k] = v;
    }
  }
  const last = codes[codes.length - 1];
  return {
    codes,
    prices,
    code: last?.code ?? null,
    label: last?.label ?? '',
    leaderName: last?.leaderName ?? '',
    expiresAt: last?.expiresAt ?? null,
    scopeText: last?.scopeText ?? '',
  };
}

function saveCodes(codes: PromoEntry[]) {
  if (codes.length) localStorage.setItem(PROMO_KEY, JSON.stringify({ codes }));
  else localStorage.removeItem(PROMO_KEY);
}

const savedCodes: PromoEntry[] = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(PROMO_KEY) || 'null');
    if (!raw) return [];
    if (Array.isArray(raw.codes)) return raw.codes as PromoEntry[];
    // The single-code form saved before: checked again on load anyway
    if (raw.code) {
      return [{
        code: raw.code, label: raw.label || '', leaderName: raw.leaderName || '', expiresAt: raw.expiresAt ?? null,
        prices: raw.prices || {}, scope: 'all', scopeCategoryId: null, scopeProductIds: [], scopeText: raw.scopeText || '',
      }];
    }
  } catch { /* ignore */ }
  return [];
})();

export const usePromoStore = create<PromoState>((set, get) => ({
  ...derive(savedCodes),
  checking: false,
  apply: async (raw) => {
    const code = raw.trim().toUpperCase();
    if (!code) return { ok: false, error: 'Введите промокод' };
    set({ checking: true });
    const res = await validateStorePromo(code);
    if (!res.valid || !res.code) {
      set({ checking: false });
      return { ok: false, error: res.error || 'Промокод не найден' };
    }
    const entry = toEntry(res);
    const slot = slotOf(entry);
    const replaced = get().codes.find((c) => c.code !== entry.code && slotOf(c) === slot);
    let codes = [...get().codes.filter((c) => c.code !== entry.code && slotOf(c) !== slot), entry];
    if (codes.length > MAX_CODES) codes = codes.slice(-MAX_CODES);
    saveCodes(codes);
    set({ ...derive(codes), checking: false });
    if (replaced) void forgetStorePromo(replaced.code);
    return { ok: true, replaced: replaced?.code };
  },
  // Prices and the codes themselves can change after they were saved —
  // refresh on load and drop quietly the ones that no longer work.
  revalidate: async () => {
    const before = get().codes;
    if (!before.length) return;
    const results = await Promise.all(before.map((c) => validateStorePromo(c.code)));
    const kept: PromoEntry[] = [];
    results.forEach((res, i) => {
      if (res.valid && res.code) kept.push(toEntry(res));
      else if (!res.error || /rate|попыток/i.test(res.error)) kept.push(before[i]);
    });
    // Codes put on while the check ran stay too
    const added = get().codes.filter((c) => !before.some((b) => b.code === c.code));
    const codes = [...kept, ...added];
    saveCodes(codes);
    set(derive(codes));
  },
  remove: (code) => {
    const codes = get().codes.filter((c) => c.code !== code);
    saveCodes(codes);
    set(derive(codes));
    void forgetStorePromo(code);
  },
  clear: () => {
    const was = get().codes;
    saveCodes([]);
    set(derive([]));
    for (const c of was) void forgetStorePromo(c.code);
  },
}));

/** The codes that make something in this category cheaper, narrowest first. */
export function codesForCategory(codes: PromoEntry[], categoryId: number | null | undefined, productIds: number[] = []): PromoEntry[] {
  const rank = { products: 0, category: 1, all: 2 } as const;
  return codes
    .filter((c) => c.scope === 'all'
      || (c.scope === 'category' && c.scopeCategoryId === categoryId)
      || (c.scope === 'products' && c.scopeProductIds.some((id) => productIds.includes(id))))
    .sort((a, b) => rank[a.scope] - rank[b.scope]);
}

/**
 * Price the buyer pays right now: the promo price when a code is active.
 * `key` is a product id, or promoKey() of a variant.
 */
export function priceFor(key: number | string, basePrice: number | null | undefined, prices: Record<string, number>): number {
  const promo = prices[String(key)];
  const base = Number(basePrice) || 0;
  return promo != null && promo < base ? promo : base;
}

/** Where the promo price of a product or one of its variants sits in `prices`. */
export function promoKey(productId: number, variantId?: number | null): string {
  return variantId ? `v${variantId}` : String(productId);
}

/** One cart line per product and variant. */
export function cartKey(item: Pick<CartItem, 'id' | 'variant_id'>): string {
  return `${item.id}:${item.variant_id ?? ''}`;
}

// ==================== CART STORE ====================
interface CartState {
  items: CartItem[];
  sidebarOpen: boolean;
  checkoutOpen: boolean;
  addItem: (product: Product, variantComment?: string, variant?: ProductVariant | null) => void;
  removeItem: (key: string) => void;
  changeQty: (key: string, delta: number) => void;
  clearCart: () => void;
  /** Bring saved lines in line with the current catalog (prices, sizes, removals). */
  syncWithCatalog: (products: Product[]) => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  totalItems: () => number;
}

const CART_KEY = 'refsale_cart';
const savedCart: CartItem[] = (() => {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
})();

function persist(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export const useCartStore = create<CartState>((set, get) => ({
  items: savedCart,
  sidebarOpen: false,
  checkoutOpen: false,
  addItem: (product, variantComment, variant) => {
    const { items } = get();
    const key = cartKey({ id: product.id, variant_id: variant?.id ?? null });
    const existing = items.find((i) => cartKey(i) === key);
    const newItems = existing
      ? items.map((i) => cartKey(i) === key ? { ...i, qty: Math.min(i.qty + 1, 99), variant_comment: variantComment || i.variant_comment } : i)
      : [...items, {
          id: product.id,
          name: product.name,
          price: variant ? variant.price : product.price,
          image_url: product.image_url,
          qty: 1,
          variant_comment: variantComment,
          variant_id: variant?.id ?? null,
          variant_label: variant?.label,
        }];
    persist(newItems);
    set({ items: newItems });
  },
  removeItem: (key) => {
    const newItems = get().items.filter((i) => cartKey(i) !== key);
    persist(newItems);
    set({ items: newItems });
  },
  changeQty: (key, delta) => {
    const item = get().items.find((i) => cartKey(i) === key);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) { get().removeItem(key); return; }
    const newItems = get().items.map((i) => cartKey(i) === key ? { ...i, qty: Math.min(newQty, 99) } : i);
    persist(newItems);
    set({ items: newItems });
  },
  clearCart: () => { persist([]); set({ items: [] }); },
  // The cart lives in localStorage for days. Since then the admin may have
  // changed a price, added sizes to a product or removed it — the server would
  // refuse such a line at checkout, so fix it here first.
  syncWithCatalog: (products) => {
    const byId = new Map(products.map((p) => [p.id, p]));
    let dropped = 0;
    const next: CartItem[] = [];
    for (const item of get().items) {
      const p = byId.get(item.id);
      const variants = p?.variants || [];
      if (!p) { dropped += 1; continue; }
      if (variants.length) {
        const v = variants.find((x) => x.id === item.variant_id);
        if (!v) { dropped += 1; continue; }
        next.push({ ...item, name: p.name, price: v.price, variant_label: v.label, image_url: p.image_url });
      } else {
        if (item.variant_id) { dropped += 1; continue; }
        next.push({ ...item, name: p.name, price: p.price, image_url: p.image_url });
      }
    }
    const changed = dropped > 0 || next.some((n, i) => n.price !== get().items[i]?.price || n.name !== get().items[i]?.name);
    if (!changed) return;
    persist(next);
    set({ items: next });
    if (dropped) {
      useNotificationStore.getState().show('Часть товаров в корзине изменилась — выберите их заново', 'error');
    }
  },
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  openCheckout: () => set({ checkoutOpen: true, sidebarOpen: false }),
  closeCheckout: () => set({ checkoutOpen: false }),
  totalItems: () => get().items.reduce((s, i) => s + i.qty, 0),
}));

// ==================== FAVORITES STORE ====================
// Kept in the browser: no account is needed to collect favourites.
interface FavoritesState {
  ids: number[];
  /** Returns true when the product was added, false when it was removed. */
  toggle: (productId: number) => boolean;
}

const FAV_KEY = 'refsale_favorites';
const savedFavs: number[] = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : [];
  } catch { return []; }
})();

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: savedFavs,
  toggle: (productId) => {
    const added = !get().ids.includes(productId);
    const ids = added ? [...get().ids, productId] : get().ids.filter((id) => id !== productId);
    localStorage.setItem(FAV_KEY, JSON.stringify(ids));
    set({ ids });
    return added;
  },
}));

// ==================== NOTIFICATION STORE ====================
// One toast at a time. A new message takes the current one's place instead of
// stacking under it (ten taps on a heart used to fill the screen); the same
// message again only bumps a ×N counter and keeps it up a little longer.
interface Notification {
  id: number;
  text: string;
  type: 'success' | 'error';
  /** How many times in a row this same message came in. */
  count: number;
}

interface NotificationState {
  notifications: Notification[];
  show: (text: string, type?: 'success' | 'error') => void;
  remove: (id: number) => void;
  clear: () => void;
}

const TOAST_MS = 3000;
let _notifId = 0;
let _notifTimer: ReturnType<typeof setTimeout> | undefined;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  show: (text, type = 'success') => {
    const current = get().notifications[0];
    const next = current && current.text === text && current.type === type
      ? { ...current, count: current.count + 1 }
      : { id: ++_notifId, text, type, count: 1 };
    set({ notifications: [next] });
    clearTimeout(_notifTimer);
    _notifTimer = setTimeout(() => get().remove(next.id), TOAST_MS);
  },
  remove: (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) });
  },
  clear: () => { clearTimeout(_notifTimer); set({ notifications: [] }); },
}));

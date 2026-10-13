import { create } from 'zustand';
import type { Category, Subcategory, Product, User, CartItem, Review } from '../types';
import { fetchCatalog, fetchSettings, fetchUserById, fetchReviews, validateStorePromo } from '../api/client';
import { getToken, clearToken } from '../api/authToken';

// ==================== APP STORE ====================
interface AppState {
  categories: Category[];
  subcategories: Subcategory[];
  products: Product[];
  reviews: Review[];
  settings: Record<string, string>;
  loading: boolean;
  loadData: () => Promise<void>;
  loadReviews: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  categories: [],
  subcategories: [],
  products: [],
  reviews: [],
  settings: {},
  loading: true,
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
    } catch {
      set({ loading: false });
    }
  },
  loadReviews: async () => {
    const reviews = await fetchReviews();
    set({ reviews });
  },
}));

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
interface PromoState {
  code: string | null;
  label: string;
  leaderName: string;
  /** product id → promo price, only for products that have one */
  prices: Record<string, number>;
  checking: boolean;
  apply: (code: string) => Promise<{ ok: boolean; error?: string }>;
  revalidate: () => Promise<void>;
  clear: () => void;
}

const PROMO_KEY = 'refsale_promo';
const savedPromo = (() => {
  try { return JSON.parse(localStorage.getItem(PROMO_KEY) || 'null') as { code: string; label: string; leaderName: string; prices: Record<string, number> } | null; }
  catch { return null; }
})();

export const usePromoStore = create<PromoState>((set, get) => ({
  code: savedPromo?.code || null,
  label: savedPromo?.label || '',
  leaderName: savedPromo?.leaderName || '',
  prices: savedPromo?.prices || {},
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
    const next = { code: res.code, label: res.label || '', leaderName: res.leader_name || '', prices: res.prices || {} };
    localStorage.setItem(PROMO_KEY, JSON.stringify(next));
    set({ ...next, checking: false });
    return { ok: true };
  },
  // Prices and the code itself can change after it was saved — refresh on load
  // and drop it quietly if it no longer works.
  revalidate: async () => {
    const { code } = get();
    if (!code) return;
    const res = await validateStorePromo(code);
    if (res.valid && res.code) {
      const next = { code: res.code, label: res.label || '', leaderName: res.leader_name || '', prices: res.prices || {} };
      localStorage.setItem(PROMO_KEY, JSON.stringify(next));
      set(next);
    } else if (res.error && !/rate|попыток/i.test(res.error)) {
      get().clear();
    }
  },
  clear: () => {
    localStorage.removeItem(PROMO_KEY);
    set({ code: null, label: '', leaderName: '', prices: {} });
  },
}));

/** Price the buyer pays right now: the promo price when a code is active. */
export function priceFor(productId: number, basePrice: number | null | undefined, prices: Record<string, number>): number {
  const promo = prices[String(productId)];
  const base = Number(basePrice) || 0;
  return promo != null && promo < base ? promo : base;
}

// ==================== CART STORE ====================
interface CartState {
  items: CartItem[];
  sidebarOpen: boolean;
  checkoutOpen: boolean;
  addItem: (product: Product, variantComment?: string) => void;
  removeItem: (productId: number) => void;
  changeQty: (productId: number, delta: number) => void;
  clearCart: () => void;
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
  addItem: (product, variantComment) => {
    const { items } = get();
    const existing = items.find((i) => i.id === product.id);
    const newItems = existing
      ? items.map((i) => i.id === product.id ? { ...i, qty: Math.min(i.qty + 1, 99), variant_comment: variantComment || i.variant_comment } : i)
      : [...items, {
          id: product.id,
          name: product.name,
          price: product.price,
          image_url: product.image_url,
          qty: 1,
          variant_comment: variantComment,
        }];
    persist(newItems);
    set({ items: newItems });
  },
  removeItem: (productId) => {
    const newItems = get().items.filter((i) => i.id !== productId);
    persist(newItems);
    set({ items: newItems });
  },
  changeQty: (productId, delta) => {
    const item = get().items.find((i) => i.id === productId);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) { get().removeItem(productId); return; }
    const newItems = get().items.map((i) => i.id === productId ? { ...i, qty: Math.min(newQty, 99) } : i);
    persist(newItems);
    set({ items: newItems });
  },
  clearCart: () => { persist([]); set({ items: [] }); },
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  openCheckout: () => set({ checkoutOpen: true, sidebarOpen: false }),
  closeCheckout: () => set({ checkoutOpen: false }),
  totalItems: () => get().items.reduce((s, i) => s + i.qty, 0),
}));

// ==================== NOTIFICATION STORE ====================
interface Notification {
  id: number;
  text: string;
  type: 'success' | 'error';
}

interface NotificationState {
  notifications: Notification[];
  show: (text: string, type?: 'success' | 'error') => void;
  remove: (id: number) => void;
}

let _notifId = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  show: (text, type = 'success') => {
    const id = ++_notifId;
    set({ notifications: [...get().notifications, { id, text, type }] });
    setTimeout(() => get().remove(id), 3500);
  },
  remove: (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) });
  },
}));

import { create } from 'zustand';
import { API_BASE } from '../api/client';

/** The newest forum post, review, product and news post the visitor has seen. */
type Seen = { forum: number; reviews: number; products: number; news: number };

const KEY = 'refsale_seen';

function load(): Seen | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v.forum === 'number' ? { news: 0, ...v } as Seen : null;
  } catch { return null; }
}

function save(v: Seen) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
}

interface NewsState {
  forumNew: number;
  reviewsNew: number;
  /** New products since the last look at the catalog: a dot, not a number */
  catalogNew: boolean;
  /** A new post in the buyers' news feed: a dot on the «Новости» tab */
  newsNew: boolean;
  max: Seen;
  refresh: () => Promise<void>;
  /** The visitor has seen it all up to `id` (or the newest known). */
  markSeen: (what: keyof Seen, id?: number) => void;
}

/**
 * Counters for the menu: what appeared on the forum, in reviews and in the
 * catalog since the last visit. A first visit starts from "seen everything" —
 * a newcomer is not greeted with a hundred unread posts.
 */
export const useNewsStore = create<NewsState>((set, get) => ({
  forumNew: 0,
  reviewsNew: 0,
  catalogNew: false,
  newsNew: false,
  max: { forum: 0, reviews: 0, products: 0, news: 0 },
  refresh: async () => {
    const seen = load();
    try {
      const r = await fetch(`${API_BASE}/api/store/news?forum=${seen?.forum ?? 0}&reviews=${seen?.reviews ?? 0}`);
      if (!r.ok) return;
      const d = await r.json();
      const max: Seen = { forum: Number(d.forum_max) || 0, reviews: Number(d.reviews_max) || 0, products: Number(d.products_max) || 0, news: Number(d.news_max) || 0 };
      if (!seen) {
        save(max);
        set({ max, forumNew: 0, reviewsNew: 0, catalogNew: false, newsNew: false });
        return;
      }
      set({ max, forumNew: Number(d.forum_new) || 0, reviewsNew: Number(d.reviews_new) || 0, catalogNew: max.products > seen.products, newsNew: max.news > seen.news });
    } catch { /* offline: keep the last counters */ }
  },
  markSeen: (what, id) => {
    const max = get().max;
    const top = Math.max(id ?? 0, max[what]);
    if (!top) return;
    // Before the first check there is nothing to mark: it starts from "seen all"
    const seen = load();
    if (!seen) return;
    const flag = what === 'forum' ? get().forumNew : what === 'reviews' ? get().reviewsNew : what === 'news' ? get().newsNew : get().catalogNew;
    if (seen[what] >= top && !flag) return;
    save({ ...seen, [what]: Math.max(seen[what], top) });
    set(what === 'forum' ? { forumNew: 0 } : what === 'reviews' ? { reviewsNew: 0 } : what === 'news' ? { newsNew: false } : { catalogNew: false });
  },
}));

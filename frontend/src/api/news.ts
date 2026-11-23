import { API_BASE } from './client';

export type NewsFeed = 'buyers' | 'partners';

export interface NewsMedia { url: string; type: 'image' | 'video' }

export interface NewsPost {
  id: number;
  feed: NewsFeed;
  title: string;
  body: string;
  tags: string[];
  media: NewsMedia[];
  author_user_id: number | null;
  author_role: 'admin' | 'leader' | 'supplier';
  author_name: string;
  author_avatar?: string | null;
  is_pinned: boolean;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked: boolean;
  is_mine: boolean;
}

export interface NewsComment {
  id: number;
  post_id: number;
  user_id: number | null;
  author_name: string;
  author_role: string;
  text: string;
  created_at: string;
  avatar_url?: string | null;
  is_mine: boolean;
}

export interface NewsMeta {
  role: 'leader' | 'supplier' | 'buyer' | null;
  feeds: Array<{ key: NewsFeed; label: string }>;
  can_post: boolean;
  tags: Partial<Record<NewsFeed, string[]>>;
  latest_id: number;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(API_BASE + path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
  return data as T;
}

export const fetchNewsMeta = () => call<NewsMeta>('/api/news/meta');

export function fetchNews(params: { feed: NewsFeed; tag?: string; q?: string; offset?: number; limit?: number }) {
  const qs = new URLSearchParams({ feed: params.feed, offset: String(params.offset || 0), limit: String(params.limit || 10) });
  if (params.tag) qs.set('tag', params.tag);
  if (params.q) qs.set('q', params.q);
  return call<{ items: NewsPost[]; has_more: boolean }>(`/api/news?${qs}`);
}

export const createNewsPost = (body: { feed: NewsFeed; title: string; body: string; tags: string[]; media: NewsMedia[] }) =>
  call<{ post: NewsPost }>('/api/news', { method: 'POST', body: JSON.stringify(body) });

export const deleteNewsPost = (id: number) => call(`/api/news/${id}`, { method: 'DELETE' });

export const toggleNewsLike = (id: number) => call<{ liked: boolean; like_count: number }>(`/api/news/${id}/like`, { method: 'POST' });

export const fetchNewsComments = (id: number) => call<NewsComment[]>(`/api/news/${id}/comments`);

export const addNewsComment = (id: number, text: string) =>
  call<NewsComment>(`/api/news/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });

export const deleteNewsComment = (id: number) => call(`/api/news/comments/${id}`, { method: 'DELETE' });

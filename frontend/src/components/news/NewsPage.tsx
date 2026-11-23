import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, m } from 'framer-motion';
import { Hash, Heart, Loader2, Lock, MessageCircle, Newspaper, PenLine, Pin, Search, Send, ShoppingBag, Trash2, Users, X } from 'lucide-react';
import { runAfterAuth, useAuthStore, useNotificationStore } from '../../store';
import { useNewsStore } from '../../store/news';
import {
  addNewsComment, createNewsPost, deleteNewsComment, deleteNewsPost, fetchNews, fetchNewsComments, fetchNewsMeta, toggleNewsLike,
  type NewsComment, type NewsFeed, type NewsMedia, type NewsMeta, type NewsPost,
} from '../../api/news';
import { formatDate, unescapeHtml } from '../../utils/format';
import { isVideoUrl } from '../../utils/media';
import usePageMeta from '../../hooks/usePageMeta';
import Avatar from '../ui/Avatar';
import Lightbox from '../ui/Lightbox';
import Modal from '../ui/Modal';
import ImageUploader from '../ui/ImageUploader';
import Meerkat from '../mascot/Meerkat';

const PAGE = 10;
const EASE = [0.22, 1, 0.36, 1] as const;
const FEED_INFO: Record<NewsFeed, { label: string; hint: string; icon: typeof Users }> = {
  buyers: { label: 'Покупателям', hint: 'Поставки, новинки, рецепты', icon: ShoppingBag },
  partners: { label: 'Лидерам и поставщикам', hint: 'Закрытая лента партнёров', icon: Users },
};
const ROLE_LABEL: Record<string, string> = { admin: 'RefSale', leader: 'Лидер мнений', supplier: 'Поставщик', buyer: '' };

/**
 * News in the catalog (/news): a side panel with the two feeds — for buyers,
 * and for opinion leaders and suppliers — and the tags; the feed itself with
 * photos and videos, likes and comments. Leaders and suppliers write posts
 * here; the platform posts from the admin panel.
 */
export default function NewsPage() {
  const user = useAuthStore((s) => s.user);
  const openAuth = useAuthStore((s) => s.openAuth);
  const [params, setParams] = useSearchParams();
  const feed: NewsFeed = params.get('feed') === 'partners' ? 'partners' : 'buyers';
  const tag = params.get('tag') || '';
  const [meta, setMeta] = useState<NewsMeta | null>(null);
  const [items, setItems] = useState<NewsPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  // Which feed, tag and search the list on screen belongs to: while it is not
  // the one asked for, the page shows placeholders
  const [loadedKey, setLoadedKey] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [composing, setComposing] = useState(false);
  usePageMeta('Новости RefSale — поставки, новинки и рецепты', 'Новости RefSale: поставки продукции, новинки каталога, рецепты и советы.', '/news');

  useEffect(() => { fetchNewsMeta().then(setMeta).catch(() => setMeta(null)); }, [user?.id]);
  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 300); return () => clearTimeout(t); }, [query]);

  const canPartners = !!meta?.feeds.some((f) => f.key === 'partners');
  const load = useCallback(async (offset: number) => {
    const res = await fetchNews({ feed, tag, q, offset, limit: PAGE });
    return res;
  }, [feed, tag, q]);

  const key = `${feed}|${tag}|${q}|${user?.id ?? 0}`;
  const loading = loadedKey !== key;
  useEffect(() => {
    let alive = true;
    load(0).then((res) => { if (!alive) return; setItems(res.items); setHasMore(res.has_more); setError(''); })
      .catch((e) => { if (alive) { setItems([]); setHasMore(false); setError((e as Error).message); } })
      .finally(() => { if (alive) setLoadedKey(key); });
    return () => { alive = false; };
  }, [load, key]);

  // The buyers' feed seen: the dot on the «Новости» tab goes
  useEffect(() => {
    if (feed === 'buyers' && items.length) useNewsStore.getState().markSeen('news', Math.max(...items.map((p) => p.id)));
  }, [feed, items]);

  const showMore = async () => {
    setMore(true);
    try { const res = await load(items.length); setItems((all) => [...all, ...res.items]); setHasMore(res.has_more); }
    catch (e) { setError((e as Error).message); }
    setMore(false);
  };

  const pickFeed = (f: NewsFeed) => {
    if (f === 'partners' && !canPartners) return;
    setParams(f === 'buyers' ? {} : { feed: f });
  };
  const pickTag = (t: string) => {
    const next = new URLSearchParams(params);
    if (!t || t === tag) next.delete('tag'); else next.set('tag', t);
    setParams(next);
  };
  const write = () => {
    if (!user) { runAfterAuth(() => setComposing(true)); openAuth('login', 'Войдите, чтобы опубликовать новость.'); return; }
    setComposing(true);
  };
  const tags = useMemo(() => meta?.tags?.[feed] || [], [meta, feed]);
  const replace = (p: NewsPost) => setItems((all) => all.map((x) => (x.id === p.id ? p : x)));

  return (
    <main className="pt-[calc(var(--header-h,140px)+24px)] pb-28 max-md:pb-16 min-h-screen">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4 grid lg:grid-cols-[300px_minmax(0,1fr)] gap-8 max-lg:gap-5 items-start">
        {/* Side panel: the two feeds, search, tags, «Написать» */}
        <aside className="lg:sticky lg:top-[calc(var(--header-h,140px)+20px)] space-y-4 max-lg:space-y-3">
          <div className="bg-card border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_5px_0_#111] p-5 max-sm:p-4">
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-[13px] bg-sun border-2 border-ink grid place-items-center"><Newspaper size={19} /></span>
              <h1 className="font-display text-[26px] max-sm:text-[22px] leading-none">Новости</h1>
            </div>
            <div className="mt-4 grid gap-2 max-lg:grid-cols-2 max-sm:gap-1.5" role="tablist" aria-label="Ленты новостей">
              {(['buyers', 'partners'] as NewsFeed[]).map((f) => {
                const info = FEED_INFO[f]; const Icon = info.icon; const active = feed === f; const locked = f === 'partners' && !canPartners;
                return (
                  <button
                    key={f} role="tab" aria-selected={active} onClick={() => pickFeed(f)} disabled={locked}
                    title={locked ? 'Лента для лидеров мнений и поставщиков' : undefined}
                    className={`text-left flex items-center gap-3 max-sm:gap-2 rounded-[16px] border-2 px-3.5 py-3 max-sm:px-2.5 max-sm:py-2.5 transition-colors ${active ? 'bg-accent-strong border-ink' : 'bg-card border-ink/12 hover:border-ink'} ${locked ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className={`w-9 h-9 max-sm:w-8 max-sm:h-8 shrink-0 rounded-full grid place-items-center ${active ? 'bg-ink text-sun' : 'bg-surface text-ink'}`}>{locked ? <Lock size={15} /> : <Icon size={16} />}</span>
                    <span className="min-w-0"><span className="block text-[13.5px] max-sm:text-[12.5px] font-bold leading-tight">{info.label}</span><span className="block text-[11.5px] max-sm:text-[10.5px] text-muted leading-tight mt-0.5 max-sm:hidden">{info.hint}</span></span>
                  </button>
                );
              })}
            </div>
            {meta?.can_post && (
              <button onClick={write} className="btn-primary w-full mt-4 max-sm:mt-3"><PenLine size={15} strokeWidth={2.4} />Написать новость</button>
            )}
          </div>
          <div className="bg-card border-2 border-ink/12 rounded-[20px] p-4 max-lg:hidden">
            <label className="relative block">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по новостям" className="field !pl-9 !h-10 !text-[13px]" />
            </label>
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((t) => <TagChip key={t} tag={t} active={t === tag} onClick={() => pickTag(t)} />)}
              </div>
            )}
          </div>
        </aside>

        <section aria-label={FEED_INFO[feed].label} className="min-w-0 max-w-[760px] w-full">
          {/* Phones: search and tags under the feeds */}
          <div className="lg:hidden mb-4 space-y-2">
            <label className="relative block">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по новостям" className="field !pl-9 !h-10 !text-[13px]" />
            </label>
            {tags.length > 0 && <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">{tags.map((t) => <TagChip key={t} tag={t} active={t === tag} onClick={() => pickTag(t)} />)}</div>}
          </div>
          {tag && (
            <div className="mb-4 flex items-center gap-2 text-[13px]"><span className="text-muted">Тег:</span><TagChip tag={tag} active onClick={() => pickTag('')} /><button onClick={() => pickTag('')} className="text-muted hover:text-ink inline-flex items-center gap-1 cursor-pointer"><X size={13} />сбросить</button></div>
          )}
          {loading ? (
            <div className="space-y-5">{[0, 1].map((i) => <div key={i} className="h-[320px] rounded-[24px] bg-ink/[0.05] animate-pulse" />)}</div>
          ) : error ? (
            <Empty title="Лента недоступна" text={error} />
          ) : items.length === 0 ? (
            <Empty title={q || tag ? 'Ничего не нашлось' : 'Новостей пока нет'} text={q || tag ? 'Попробуйте другой запрос или тег.' : 'Скоро здесь появятся поставки, новинки и рецепты.'} />
          ) : (
            <div className="space-y-5 max-sm:space-y-4">
              {items.map((p) => <PostCard key={p.id} post={p} onChange={replace} onRemoved={() => setItems((all) => all.filter((x) => x.id !== p.id))} onTag={pickTag} />)}
              {hasMore && (
                <div className="text-center pt-2"><button onClick={showMore} disabled={more} className="btn-outline">{more ? <Loader2 size={16} className="animate-spin" /> : 'Показать ещё'}</button></div>
              )}
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {composing && user && meta?.can_post && (
          <Composer
            userId={user.id} defaultFeed={feed} canPartners={canPartners} onClose={() => setComposing(false)}
            onCreated={(p) => { setComposing(false); if (p.feed === feed) setItems((all) => [p, ...all]); else setParams(p.feed === 'buyers' ? {} : { feed: p.feed }); }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function TagChip({ tag, active, onClick }: { tag: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 inline-flex items-center gap-0.5 h-7 px-2.5 rounded-full border text-[12px] font-semibold cursor-pointer transition-colors ${active ? 'bg-ink border-ink text-sun' : 'bg-surface border-ink/10 text-ink/80 hover:border-ink'}`}>
      <Hash size={11} strokeWidth={2.6} />{unescapeHtml(tag)}
    </button>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-card border-2 border-ink rounded-[24px] shadow-[0_6px_0_#111] p-8 max-sm:p-6 flex items-center gap-6 max-sm:flex-col max-sm:text-center">
      <Meerkat pose="laptop" width={120} decorative className="shrink-0" />
      <div><p className="font-display text-[24px] text-ink">{title}</p><p className="text-[14px] text-muted mt-2">{text}</p></div>
    </div>
  );
}

function PostCard({ post, onChange, onRemoved, onTag }: { post: NewsPost; onChange: (p: NewsPost) => void; onRemoved: () => void; onTag: (t: string) => void }) {
  const user = useAuthStore((s) => s.user);
  const openAuth = useAuthStore((s) => s.openAuth);
  const show = useNotificationStore((s) => s.show);
  const [viewer, setViewer] = useState<number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const body = unescapeHtml(post.body);
  const long = body.length > 420;
  const images = post.media.filter((x) => x.type === 'image').map((x) => x.url);

  const like = async () => {
    if (!user) { openAuth('login', 'Войдите, чтобы отмечать понравившиеся новости.'); return; }
    onChange({ ...post, liked: !post.liked, like_count: post.like_count + (post.liked ? -1 : 1) });
    try { const r = await toggleNewsLike(post.id); onChange({ ...post, liked: r.liked, like_count: r.like_count }); }
    catch (e) { onChange(post); show((e as Error).message, 'error'); }
  };
  const remove = async () => {
    if (!window.confirm('Удалить публикацию?')) return;
    try { await deleteNewsPost(post.id); onRemoved(); show('Публикация удалена'); } catch (e) { show((e as Error).message, 'error'); }
  };
  const role = ROLE_LABEL[post.author_role] || '';

  return (
    <m.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}
      className="bg-card border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_5px_0_#111] overflow-hidden">
      <header className="flex items-center gap-3 px-6 max-sm:px-4 pt-5 max-sm:pt-4">
        {post.author_role === 'admin'
          ? <img src="/img/logo-meerkat.webp" alt="" className="w-11 h-11 rounded-full border-2 border-ink bg-sun object-contain p-1" />
          : <Avatar name={unescapeHtml(post.author_name)} url={post.author_avatar || undefined} colorKey={`u${post.author_user_id}`} size={44} />}
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[14.5px] leading-tight truncate">{post.author_role === 'admin' ? unescapeHtml(post.author_name) || 'RefSale' : unescapeHtml(post.author_name)}</div>
          <div className="text-[12px] text-muted mt-0.5">{role && post.author_role !== 'admin' ? `${role} · ` : ''}{formatDate(post.created_at)}</div>
        </div>
        {post.is_pinned && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-sun border border-ink/20 text-[11px] font-bold"><Pin size={11} />Закреплено</span>}
        {post.is_mine && <button onClick={remove} className="w-9 h-9 rounded-full grid place-items-center text-muted hover:text-[#B4232A] hover:bg-[#FDE2E2] cursor-pointer" aria-label="Удалить публикацию"><Trash2 size={15} /></button>}
      </header>
      <div className="px-6 max-sm:px-4 pt-4">
        <h2 className="font-display text-[23px] max-sm:text-[19px] leading-[1.2] text-ink break-words">{unescapeHtml(post.title)}</h2>
        {body && (
          <p className={`mt-2.5 text-[14.5px] max-sm:text-[14px] leading-[1.65] text-ink/80 whitespace-pre-line break-words ${long && !expanded ? 'line-clamp-6' : ''}`}>{body}</p>
        )}
        {long && <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-[13px] font-bold underline underline-offset-4 decoration-2 decoration-sun hover:decoration-ink cursor-pointer">{expanded ? 'Свернуть' : 'Читать полностью'}</button>}
        {post.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{post.tags.map((t) => <TagChip key={t} tag={t} onClick={() => onTag(t)} />)}</div>}
      </div>
      {post.media.length > 0 && <MediaGrid media={post.media} onOpen={(url) => setViewer(Math.max(0, images.indexOf(url)))} />}
      <footer className="px-6 max-sm:px-4 py-3.5 mt-4 border-t border-ink/10 flex items-center gap-2">
        <button onClick={like} aria-pressed={post.liked} className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border-2 text-[13px] font-bold tabular-nums cursor-pointer transition-colors ${post.liked ? 'bg-primary border-primary text-white' : 'bg-card border-ink/15 hover:border-ink'}`}>
          <Heart size={15} strokeWidth={2.4} fill={post.liked ? 'currentColor' : 'none'} />{post.like_count > 0 ? post.like_count : 'Нравится'}
        </button>
        <button onClick={() => setCommentsOpen((v) => !v)} aria-expanded={commentsOpen} className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border-2 text-[13px] font-bold tabular-nums cursor-pointer transition-colors ${commentsOpen ? 'bg-ink border-ink text-sun' : 'bg-card border-ink/15 hover:border-ink'}`}>
          <MessageCircle size={15} strokeWidth={2.4} />{post.comment_count > 0 ? post.comment_count : 'Комментировать'}
        </button>
      </footer>
      <AnimatePresence initial={false}>
        {commentsOpen && <Comments post={post} onCount={(n) => onChange({ ...post, comment_count: n })} />}
      </AnimatePresence>
      {viewer !== null && images.length > 0 && <Lightbox images={images} startIndex={viewer} alt={unescapeHtml(post.title)} onClose={() => setViewer(null)} />}
    </m.article>
  );
}

/** One photo full width; several in a grid; videos play in place. */
function MediaGrid({ media, onOpen }: { media: NewsMedia[]; onOpen: (url: string) => void }) {
  const shown = media.slice(0, 5);
  const extra = media.length - shown.length;
  const single = shown.length === 1;
  return (
    <div className={`mt-4 px-6 max-sm:px-4 grid gap-1.5 ${single ? '' : shown.length === 2 ? 'grid-cols-2' : 'grid-cols-6'}`}>
      {shown.map((item, i) => {
        // 3: one wide on top and two under it; 4: two by two; 5: two, then three
        const n = shown.length;
        const span = single || n === 2 ? '' : n === 3 ? (i === 0 ? 'col-span-6' : 'col-span-3') : n === 4 ? 'col-span-3' : i < 2 ? 'col-span-3' : 'col-span-2';
        const ratio = single || (n === 3 && i === 0) ? 'aspect-[16/9]' : n === 5 && i >= 2 ? 'aspect-square' : 'aspect-[4/3]';
        return (
          <div key={item.url} className={`relative overflow-hidden rounded-[14px] bg-surface border border-ink/10 ${span} ${ratio}`}>
            {item.type === 'video' || isVideoUrl(item.url) ? (
              <video src={item.url} controls preload="metadata" playsInline className="absolute inset-0 w-full h-full object-contain bg-ink" />
            ) : (
              <button onClick={() => onOpen(item.url)} className="absolute inset-0 cursor-zoom-in" aria-label="Открыть фото">
                <img src={item.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            )}
            {extra > 0 && i === shown.length - 1 && <span className="absolute inset-0 grid place-items-center bg-ink/50 text-white font-display text-[24px] pointer-events-none">+{extra}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Comments({ post, onCount }: { post: NewsPost; onCount: (n: number) => void }) {
  const user = useAuthStore((s) => s.user);
  const openAuth = useAuthStore((s) => s.openAuth);
  const show = useNotificationStore((s) => s.show);
  const [items, setItems] = useState<NewsComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchNewsComments(post.id).then(setItems).catch(() => setItems([])); }, [post.id]);
  const send = async () => {
    if (!user) { openAuth('login', 'Войдите, чтобы комментировать новости.'); return; }
    const value = text.trim(); if (!value) return;
    setBusy(true);
    try { const c = await addNewsComment(post.id, value); const next = [...(items || []), c]; setItems(next); onCount(next.length); setText(''); }
    catch (e) { show((e as Error).message, 'error'); }
    setBusy(false);
  };
  const remove = async (c: NewsComment) => {
    try { await deleteNewsComment(c.id); const next = (items || []).filter((x) => x.id !== c.id); setItems(next); onCount(next.length); }
    catch (e) { show((e as Error).message, 'error'); }
  };
  return (
    <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden bg-surface/60 border-t border-ink/10">
      <div className="px-6 max-sm:px-4 py-4 space-y-3">
        {items === null ? <div className="py-3 flex justify-center"><Loader2 size={18} className="animate-spin" /></div>
          : items.length === 0 ? <div className="text-[13px] text-muted">Комментариев пока нет — будьте первым.</div>
            : items.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <Avatar name={unescapeHtml(c.author_name)} url={c.avatar_url || undefined} colorKey={`u${c.user_id}`} size={32} />
                <div className="min-w-0 flex-1 bg-card rounded-[14px] border border-ink/10 px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-[12px]">
                    <b className="text-ink truncate">{unescapeHtml(c.author_name)}</b>
                    {ROLE_LABEL[c.author_role] && <span className="text-muted">· {ROLE_LABEL[c.author_role]}</span>}
                    <span className="text-light ml-auto shrink-0">{formatDate(c.created_at)}</span>
                    {c.is_mine && <button onClick={() => void remove(c)} className="text-muted hover:text-[#B4232A] cursor-pointer" aria-label="Удалить комментарий"><Trash2 size={12} /></button>}
                  </div>
                  <p className="text-[13.5px] leading-[1.55] text-ink/85 whitespace-pre-line break-words mt-0.5">{unescapeHtml(c.text)}</p>
                </div>
              </div>
            ))}
        <div className="flex gap-2 items-end pt-1">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={user ? 'Написать комментарий…' : 'Войдите, чтобы комментировать'} onFocus={() => { if (!user) openAuth('login', 'Войдите, чтобы комментировать новости.'); }}
            className="field !min-h-[42px] !py-2.5 !text-[13.5px] resize-none flex-1" />
          <button onClick={() => void send()} disabled={busy || !text.trim()} className="btn-primary !h-[42px] !w-[42px] !p-0 shrink-0" aria-label="Отправить комментарий">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </m.div>
  );
}

function Composer({ userId, defaultFeed, canPartners, onClose, onCreated }: {
  userId: number; defaultFeed: NewsFeed; canPartners: boolean; onClose: () => void; onCreated: (p: NewsPost) => void;
}) {
  const show = useNotificationStore((s) => s.show);
  const [feed, setFeed] = useState<NewsFeed>(defaultFeed);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    if (!title.trim()) { setError('Добавьте заголовок'); return; }
    setBusy(true);
    try {
      const { post } = await createNewsPost({
        feed, title: title.trim(), body: body.trim(),
        tags: tags.split(/[,#\n]/).map((t) => t.trim()).filter(Boolean),
        media: files.map((url) => ({ url, type: isVideoUrl(url) ? 'video' : 'image' })),
      });
      show('Новость опубликована'); onCreated(post);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title="Новая публикация" maxWidth="max-w-xl">
      <div className="space-y-3">
        {canPartners && (
          <div className="grid grid-cols-2 gap-2">
            {(['buyers', 'partners'] as NewsFeed[]).map((f) => (
              <button key={f} type="button" onClick={() => setFeed(f)} aria-pressed={feed === f}
                className={`h-11 rounded-ctl-sm border-2 text-[12.5px] font-bold cursor-pointer ${feed === f ? 'bg-accent-strong border-ink' : 'bg-card border-ink/15 hover:border-ink'}`}>
                {FEED_INFO[f].label}
              </button>
            ))}
          </div>
        )}
        <label className="block text-[12px] font-semibold text-muted">Заголовок
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} className="field mt-1.5" placeholder="Например, «Новая поставка сыров из Адыгеи»" />
        </label>
        <label className="block text-[12px] font-semibold text-muted">Описание
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={10000} className="field mt-1.5 !h-auto py-3" placeholder="Что привезли, рецепт, условия…" />
        </label>
        <label className="block text-[12px] font-semibold text-muted">Теги через запятую
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="field mt-1.5" placeholder="поставки, рецепты, сыр" />
        </label>
        <div>
          <div className="text-[12px] font-semibold text-muted mb-1.5">Фото и видео</div>
          <ImageUploader value={files} onChange={setFiles} userId={userId} prefix="news" max={10} video />
        </div>
        {error && <div role="alert" className="text-[13px] text-[#B4232A]">{error}</div>}
        <button onClick={() => void submit()} disabled={busy} className="btn-primary w-full h-12">{busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}Опубликовать</button>
      </div>
    </Modal>
  );
}

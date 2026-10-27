import { Fragment, useCallback, useEffect, useState } from 'react';
import { Loader2, MessagesSquare, Send, User } from 'lucide-react';
import { useAuthStore } from '../../store';
import { API_BASE } from '../../api/client';
import { unescapeHtml } from '../../utils/format';
import AttachedImages from '../ui/AttachedImages';
import ImageUploader from '../ui/ImageUploader';
import { initials, nickColor } from '../../utils/nick';
import { useNewsStore } from '../../store/news';
import usePageMeta from '../../hooks/usePageMeta';

interface Forum { id: number; name: string; address_key?: string; description?: string; }
interface ForumPost { id: number; forum_id: number; user_id?: number; user_name: string; text: string; images?: string | string[]; created_at: string; }

const NICK_KEY = 'forum_guest_nick';

const authorKey = (p: ForumPost) => (p.user_id ? `u${p.user_id}` : `g${p.user_name}`);

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

/** One shared forum for everyone — the cooperative's per-address forums are gone. */
export default function StoreForum() {
  const { user } = useAuthStore();
  const [forum, setForum] = useState<Forum | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [nick, setNick] = useState(() => {
    const saved = localStorage.getItem(NICK_KEY);
    if (saved) return saved;
    const n = `Гость-${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem(NICK_KEY, n);
    return n;
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);
  usePageMeta('Форум покупателей RefSale', 'Общий чат покупателей RefSale: ароматы, находки, уход. Делитесь фото и советами.', '/forums');

  const loadPosts = useCallback(async (fid: number) => {
    try {
      const r = await fetch(`${API_BASE}/api/forums/${fid}/posts`);
      const data = await r.json();
      if (Array.isArray(data)) {
        setPosts(data);
        // The open forum is read: the menu counter goes
        if (data[0]?.id) useNewsStore.getState().markSeen('forum', data[0].id);
      }
    } catch { /* keep the last list */ }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/forums`)
      .then((r) => r.json())
      .then(async (list: Forum[]) => {
        const general = Array.isArray(list) ? list.find((f) => f.address_key === 'general') : undefined;
        if (general) { setForum(general); await loadPosts(general.id); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadPosts]);

  useEffect(() => {
    if (!forum) return;
    const t = setInterval(() => loadPosts(forum.id), 6000);
    return () => clearInterval(t);
  }, [forum, loadPosts]);

  const canSend = (text.trim() || images.length > 0) && !sending;

  const send = async () => {
    if (!forum || !canSend) return;
    const name = user ? user.full_name : nick.trim();
    if (!name) return;
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/api/forums/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forum_id: forum.id, user_id: user?.id, user_name: name, text: text.trim(), images: user ? images : [] }),
      });
      const post = await r.json();
      if (post?.id) {
        setPosts((p) => [post, ...p]); setText(''); setImages([]);
        useNewsStore.getState().markSeen('forum', post.id);
      }
    } catch { /* ignore */ }
    setSending(false);
  };

  const uploader = user && <ImageUploader value={images} onChange={setImages} userId={user.id} prefix="forum" max={4} compact />;

  return (
    <section className="pt-[calc(var(--header-h,104px)+20px)] pb-10 max-sm:pt-[calc(var(--header-h,104px)+8px)] max-sm:pb-4">
      <div className="max-w-[920px] mx-auto px-5 max-sm:px-3">
        <div className="bg-card border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_6px_0_#111] overflow-hidden flex flex-col h-[calc(100dvh-var(--header-h,104px)-64px)] max-sm:h-[calc(100dvh-var(--header-h,104px)-24px)] min-h-[460px]">
          {/* The pinned head: what this room is, always in view */}
          <header className="shrink-0 bg-accent border-b-2 border-ink px-5 py-3.5 max-sm:px-4 max-sm:py-3 flex items-center gap-3.5">
            <span className="w-12 h-12 max-sm:w-11 max-sm:h-11 rounded-full bg-card border-2 border-ink grid place-items-center shrink-0 overflow-hidden">
              <img src="/img/logo-meerkat.webp" alt="" width={90} height={132} className="h-9 w-auto translate-y-1" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[24px] max-sm:text-[20px] leading-none uppercase tracking-[0.04em] text-ink">Форум</h1>
              <p className="text-[12.5px] text-ink/75 mt-1.5 truncate">
                Общий чат покупателей · ароматы, находки, уход
              </p>
            </div>
            {posts.length > 0 && (
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] bg-card border-2 border-ink rounded-full px-2.5 py-1 max-sm:hidden">
                {posts.length >= 100 ? '100+' : posts.length} сообщ.
              </span>
            )}
          </header>

          <div className="chat-bg flex-1 min-h-0 overflow-y-auto px-4 py-5 max-sm:px-3 flex flex-col-reverse gap-2.5" style={{ overscrollBehavior: 'contain' }}>
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-ink" /></div>
            ) : posts.length === 0 ? (
              <div className="m-auto text-center bg-card border-2 border-ink/10 rounded-[18px] px-6 py-8 text-muted text-sm">
                <MessagesSquare size={34} className="mx-auto mb-3 text-ink/30" />
                Пока тихо. Начните обсуждение первым!
              </div>
            ) : posts.map((p, i) => {
              const mine = user ? p.user_id === user.id : !p.user_id && p.user_name === nick;
              const older = posts[i + 1];
              // Posts run newest first in a reversed column, so the day pill
              // goes after the oldest post of each day.
              const newDay = !older || new Date(older.created_at).toDateString() !== new Date(p.created_at).toDateString();
              // A run of posts from one author shows the name and avatar once.
              const firstOfRun = !older || authorKey(older) !== authorKey(p) || newDay;
              const color = nickColor(authorKey(p));
              const name = unescapeHtml(p.user_name);
              return (
                <Fragment key={p.id}>
                  <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${firstOfRun ? 'mt-1.5' : ''}`}>
                    {!mine && (
                      firstOfRun
                        ? <span className="w-8 h-8 rounded-full grid place-items-center shrink-0 text-[11px] font-bold text-white self-start" style={{ background: color }} aria-hidden="true">{initials(name)}</span>
                        : <span className="w-8 shrink-0" aria-hidden="true" />
                    )}
                    <div className={`max-w-[76%] max-sm:max-w-[84%] px-3.5 py-2 rounded-[16px] ${mine ? 'bg-[#DCEBFF] border border-[#9DC3F0] rounded-br-[6px]' : 'bg-card border border-ink/15 rounded-bl-[6px]'}`}>
                      {firstOfRun && !mine && <div className="text-[12.5px] font-bold mb-0.5" style={{ color }}>{name}</div>}
                      {p.text && <div className="text-[14px] text-ink leading-relaxed break-words whitespace-pre-line">{unescapeHtml(p.text)}</div>}
                      <AttachedImages images={p.images} size="md" className={p.text ? 'mt-1.5' : ''} />
                      <div className="text-[10px] text-muted mt-0.5 text-right">
                        {new Date(p.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  {newDay && (
                    <div className="self-center my-1.5 text-[11.5px] font-semibold text-ink bg-card/90 border border-ink/10 rounded-full px-3 py-1">
                      {dayLabel(p.created_at)}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>

          <div className="shrink-0 border-t-2 border-ink bg-card px-3.5 py-3">
            {!user && (
              <div className="flex items-center gap-2 px-1 pb-2 text-[12px] text-muted">
                <User size={13} className="text-ink" /> Вы пишете как
                <input
                  value={nick}
                  onChange={(e) => { const v = e.target.value.slice(0, 20); setNick(v); localStorage.setItem(NICK_KEY, v); }}
                  className="bg-transparent border-b border-ink/20 text-ink font-semibold px-1 w-32 outline-none"
                  aria-label="Ваш ник"
                />
                <span className="max-sm:hidden">· фото — после входа</span>
              </div>
            )}
            {images.length > 0 && <div className="mb-2">{uploader}</div>}
            <div className="flex items-center gap-2">
              {images.length === 0 && uploader}
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder="Написать сообщение…"
                className="field !py-2.5"
                aria-label="Сообщение"
              />
              <button onClick={send} disabled={!canSend} className="btn-primary w-11 h-11 !p-0 shrink-0" aria-label="Отправить">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

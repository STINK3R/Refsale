import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessagesSquare, Send, User } from 'lucide-react';
import { useAuthStore } from '../../store';
import { API_BASE } from '../../api/client';
import { unescapeHtml } from '../../utils/format';

interface Forum { id: number; name: string; address_key?: string; description?: string; }
interface ForumPost { id: number; forum_id: number; user_id?: number; user_name: string; text: string; created_at: string; }

const NICK_KEY = 'forum_guest_nick';

/** One shared forum for everyone — the cooperative's per-address forums are gone. */
export default function StoreForum() {
  const { user } = useAuthStore();
  const [forum, setForum] = useState<Forum | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [nick, setNick] = useState(() => {
    const saved = localStorage.getItem(NICK_KEY);
    if (saved) return saved;
    const n = `Гость-${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem(NICK_KEY, n);
    return n;
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const loadPosts = useCallback(async (fid: number) => {
    try {
      const r = await fetch(`${API_BASE}/api/forums/${fid}/posts`);
      const data = await r.json();
      if (Array.isArray(data)) setPosts(data);
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

  const send = async () => {
    if (!forum || !text.trim() || sending) return;
    const name = user ? user.full_name : nick.trim();
    if (!name) return;
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/api/forums/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forum_id: forum.id, user_id: user?.id, user_name: name, text: text.trim() }),
      });
      const post = await r.json();
      if (post?.id) { setPosts((p) => [post, ...p]); setText(''); }
    } catch { /* ignore */ }
    setSending(false);
  };

  return (
    <section className="pt-28 pb-16 max-sm:pt-24">
      <div className="max-w-[860px] mx-auto px-5">
        <div className="mb-6">
          <div className="label mb-2">Сообщество</div>
          <h1 className="font-display text-[44px] leading-none text-text max-sm:text-[34px]">Общий форум</h1>
          <p className="text-sm text-muted mt-3">Обсуждаем ароматы, делимся находками и советуем друг другу уход.</p>
        </div>

        <div className="bg-card border border-line overflow-hidden flex flex-col h-[calc(100dvh-280px)] min-h-[440px]">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col-reverse gap-3" style={{ overscrollBehavior: 'contain' }}>
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
            ) : posts.length === 0 ? (
              <div className="text-center py-16 text-muted text-sm">
                <MessagesSquare size={34} className="mx-auto mb-3 text-primary/40" />
                Пока тихо. Начните обсуждение первым!
              </div>
            ) : posts.map((p) => {
              const mine = user ? p.user_id === user.id : p.user_name === nick;
              return (
                <div key={p.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] px-4 py-2.5 ${mine ? 'bg-primary/15 border border-primary/25 rounded-br-md' : 'bg-ink/[0.04] border border-ink/[0.07] rounded-bl-md'}`}>
                    <div className="text-[11px] font-semibold text-primary/90 mb-0.5">{unescapeHtml(p.user_name)}</div>
                    <div className="text-[14px] text-text leading-relaxed break-words whitespace-pre-line">{unescapeHtml(p.text)}</div>
                    <div className="text-[10px] text-light mt-1 text-right">
                      {new Date(p.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-ink/[0.07] p-3">
            {!user && (
              <div className="flex items-center gap-2 px-2 pb-2 text-[12px] text-muted">
                <User size={13} className="text-primary" /> Вы пишете как
                <input
                  value={nick}
                  onChange={(e) => { const v = e.target.value.slice(0, 20); setNick(v); localStorage.setItem(NICK_KEY, v); }}
                  className="bg-transparent border-b border-ink/15 text-text px-1 w-32 outline-none"
                  aria-label="Ваш ник"
                />
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder="Написать сообщение…"
                className="field"
              />
              <button onClick={send} disabled={!text.trim() || sending} className="btn-primary w-12 h-12 !p-0 shrink-0" aria-label="Отправить">
                {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

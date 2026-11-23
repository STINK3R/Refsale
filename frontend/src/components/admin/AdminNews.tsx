/* eslint-disable react-hooks/set-state-in-effect -- These effects start async API reads; state changes follow awaited responses. */
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Heart, ImagePlus, LoaderCircle, MessageCircle, Pin, PinOff, Send, Trash2, X } from 'lucide-react';
import { adminRequest, adminUpload } from '../../api/adminClient';
import type { AdminNotice } from './AdminApp';
import { adminArea, adminCard, adminDanger, adminInput, adminPrimary, adminSecondary, AdminBadge, AdminEmpty, AdminTitle, dateLabel, useAdminTab } from './AdminUi';
import type { NewsComment, NewsFeed, NewsMedia, NewsPost } from '../../api/news';
import { unescapeHtml } from '../../utils/format';

const TABS = ['Покупателям', 'Лидерам и поставщикам'];
const FEEDS: NewsFeed[] = ['buyers', 'partners'];
const ROLE: Record<string, string> = { admin: 'Площадка', leader: 'Лидер мнений', supplier: 'Поставщик' };

/** News feeds: publish for buyers or for leaders and suppliers, moderate posts and comments. */
export default function AdminNews({ notify }: { notify: AdminNotice }) {
  const [tab] = useAdminTab(TABS.length);
  const feed = FEEDS[tab] || 'buyers';
  const [items, setItems] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const r = await adminRequest<{ items: NewsPost[] }>(`/api/admin/news?feed=${feed}&limit=30`); setItems(r.items); }
    catch (e) { notify((e as Error).message, 'error'); }
    setLoading(false);
  }, [feed, notify]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  const remove = async (p: NewsPost) => {
    if (!window.confirm(`Удалить новость «${unescapeHtml(p.title)}»?`)) return;
    try { await adminRequest(`/api/admin/news/${p.id}`, { method: 'DELETE' }); notify('Новость удалена'); await load(); } catch (e) { notify((e as Error).message, 'error'); }
  };
  const pin = async (p: NewsPost) => {
    try { await adminRequest(`/api/admin/news/${p.id}`, { method: 'PATCH', body: JSON.stringify({ is_pinned: !p.is_pinned }) }); await load(); } catch (e) { notify((e as Error).message, 'error'); }
  };

  return <>
    <AdminTitle kicker="Новости в каталоге" title={feed === 'buyers' ? 'Лента для покупателей' : 'Лента для лидеров мнений и поставщиков'} detail={feed === 'buyers' ? 'Её видят все посетители; лайкать и комментировать могут вошедшие покупатели.' : 'Закрытая лента: читают и обсуждают только лидеры мнений и поставщики. Они же могут публиковать сами.'} />
    <div className="grid xl:grid-cols-[440px_minmax(0,1fr)] gap-5 items-start">
      <Composer feed={feed} notify={notify} onCreated={load} />
      <div className="space-y-4 min-w-0">
        {loading ? <div className="py-10 grid place-items-center"><LoaderCircle className="animate-spin" /></div>
          : items.length === 0 ? <AdminEmpty>В этой ленте пока нет публикаций</AdminEmpty>
            : items.map((p) => <PostRow key={p.id} post={p} onPin={() => void pin(p)} onDelete={() => void remove(p)} notify={notify} />)}
      </div>
    </div>
  </>;
}

function Composer({ feed, notify, onCreated }: { feed: NewsFeed; notify: AdminNotice; onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', body: '', tags: '', author_name: 'RefSale', is_pinned: false });
  const [media, setMedia] = useState<NewsMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 10 - media.length)); e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const video = file.type.startsWith('video/');
      if (file.size > (video ? 50 : 10) * 1024 * 1024) { notify(`${file.name}: файл больше ${video ? 50 : 10} МБ`, 'error'); continue; }
      try { const { url } = await adminUpload(file, 'news'); setMedia((m) => [...m, { url, type: video ? 'video' : 'image' }]); }
      catch (err) { notify(`${file.name}: ${(err as Error).message}`, 'error'); }
    }
    setUploading(false);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await adminRequest('/api/admin/news', { method: 'POST', body: JSON.stringify({ ...form, feed, media, tags: form.tags.split(/[,#\n]/).map((t) => t.trim()).filter(Boolean) }) });
      setForm({ title: '', body: '', tags: '', author_name: form.author_name, is_pinned: false }); setMedia([]);
      notify('Новость опубликована'); onCreated();
    } catch (err) { notify((err as Error).message, 'error'); }
    setBusy(false);
  };
  return <form onSubmit={submit} className={`${adminCard} p-5 space-y-3 xl:sticky xl:top-[140px]`}>
    <h2 className="font-display text-[18px]">Новая публикация</h2>
    <label className="block text-[10px] font-bold">Заголовок<input required maxLength={300} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${adminInput} mt-1`} placeholder="Поставка сыров из Адыгеи" /></label>
    <label className="block text-[10px] font-bold">Описание<textarea rows={6} maxLength={10000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={`${adminArea} mt-1`} placeholder="Что привезли, рецепт, сроки…" /></label>
    <label className="block text-[10px] font-bold">Теги через запятую<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={`${adminInput} mt-1`} placeholder="поставки, рецепты" /></label>
    <div>
      <div className="flex items-center gap-2"><b className="text-[10px]">Фото и видео · {media.length}/10</b>
        <label className={`${adminSecondary} ml-auto !min-h-8 !py-1 cursor-pointer ${uploading || media.length >= 10 ? 'opacity-50 pointer-events-none' : ''}`}>{uploading ? <LoaderCircle size={13} className="animate-spin" /> : <ImagePlus size={13} />}Выбрать файлы
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={(e) => void pick(e)} className="hidden" /></label>
      </div>
      {media.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{media.map((m) => <div key={m.url} className="relative w-16 h-16 rounded-ctl-xs overflow-hidden border border-ink/15 bg-surface">
        {m.type === 'video' ? <video src={m.url} muted className="w-full h-full object-cover" /> : <img src={m.url} alt="" className="w-full h-full object-cover" />}
        <button type="button" onClick={() => setMedia((all) => all.filter((x) => x !== m))} className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-ink/65 text-white grid place-items-center" aria-label="Убрать"><X size={10} /></button>
      </div>)}</div>}
    </div>
    <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
      <label className="text-[10px] font-bold">Подпись автора<input value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} className={`${adminInput} mt-1`} /></label>
      <label className="flex items-center gap-2 text-[11px] font-bold h-11"><input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} className="accent-primary" />Закрепить</label>
    </div>
    <button disabled={busy || uploading} className={`${adminPrimary} w-full`}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}Опубликовать</button>
  </form>;
}

function PostRow({ post, onPin, onDelete, notify }: { post: NewsPost; onPin: () => void; onDelete: () => void; notify: AdminNotice }) {
  const [comments, setComments] = useState<Array<NewsComment & { email?: string }> | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => { try { setComments(await adminRequest(`/api/admin/news/${post.id}/comments`)); } catch (e) { notify((e as Error).message, 'error'); } }, [post.id, notify]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  const removeComment = async (c: NewsComment) => {
    if (!window.confirm('Удалить комментарий?')) return;
    try { await adminRequest(`/api/admin/news/comments/${c.id}`, { method: 'DELETE' }); await load(); } catch (e) { notify((e as Error).message, 'error'); }
  };
  return <article className={`${adminCard} p-4`}>
    <div className="flex gap-3 items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted"><span>{dateLabel(post.created_at)}</span><span>·</span><b className="text-ink">{unescapeHtml(post.author_name)}</b><AdminBadge tone={post.author_role === 'admin' ? 'amber' : post.author_role === 'leader' ? 'purple' : 'blue'}>{ROLE[post.author_role] || post.author_role}</AdminBadge>{post.is_pinned && <AdminBadge tone="amber">Закреплено</AdminBadge>}</div>
        <h3 className="font-display text-[17px] mt-1 break-words">{unescapeHtml(post.title)}</h3>
        {post.body && <p className="text-[12px] text-ink/75 mt-1 whitespace-pre-line line-clamp-4 break-words">{unescapeHtml(post.body)}</p>}
        {post.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{post.tags.map((t) => <span key={t} className="text-[10px] font-bold rounded-full bg-surface px-2 py-0.5">#{unescapeHtml(t)}</span>)}</div>}
        {post.media.length > 0 && <div className="flex gap-1.5 mt-2 overflow-x-auto">{post.media.map((m) => <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="shrink-0 w-14 h-14 rounded-ctl-xs overflow-hidden border border-ink/10 bg-surface">{m.type === 'video' ? <video src={m.url} muted className="w-full h-full object-cover" /> : <img src={m.url} alt="" className="w-full h-full object-cover" />}</a>)}</div>}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={onPin} className={`${adminSecondary} !px-2`} title={post.is_pinned ? 'Открепить' : 'Закрепить'}>{post.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
        <button onClick={onDelete} className={`${adminDanger} !px-2`} title="Удалить"><Trash2 size={14} /></button>
      </div>
    </div>
    <div className="flex items-center gap-3 mt-3 text-[11px] font-bold">
      <span className="inline-flex items-center gap-1"><Heart size={13} />{post.like_count}</span>
      <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 underline underline-offset-2"><MessageCircle size={13} />Комментарии · {post.comment_count}</button>
    </div>
    {open && <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
      {comments === null ? <LoaderCircle size={15} className="animate-spin" /> : comments.length === 0 ? <div className="text-[11px] text-muted">Комментариев нет</div> : comments.map((c) => <div key={c.id} className="flex gap-2 items-start rounded-ctl-sm bg-surface/60 px-3 py-2">
        <div className="min-w-0 flex-1"><div className="text-[10px] text-muted"><b className="text-ink">{unescapeHtml(c.author_name)}</b>{c.email ? ` · ${c.email}` : ''} · {dateLabel(c.created_at)}</div><p className="text-[12px] whitespace-pre-line break-words">{unescapeHtml(c.text)}</p></div>
        <button onClick={() => void removeComment(c)} className="text-[#9A1C24] p-1" aria-label="Удалить комментарий"><Trash2 size={13} /></button>
      </div>)}
    </div>}
  </article>;
}

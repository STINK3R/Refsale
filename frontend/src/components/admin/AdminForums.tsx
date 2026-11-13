/* eslint-disable react-hooks/set-state-in-effect -- These effects start async API reads; state changes follow awaited responses. */
import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, MessageCircle, Trash2 } from 'lucide-react';
import { adminRequest } from '../../api/adminClient';
import type { AdminNotice } from './AdminApp';
import { adminCard, adminDanger, AdminBadge, AdminEmpty, AdminTitle, dateLabel } from './AdminUi';
import AttachedImages from '../ui/AttachedImages';
import Avatar from '../ui/Avatar';

type Forum = { id: number; name: string; description?: string; post_count?: number };
type Post = { id: number; forum_id: number; user_id?: number; user_name: string; text: string; images?: string | string[]; created_at: string };

export default function AdminForums({ notify }: { notify: AdminNotice }) {
  const [forums, setForums] = useState<Forum[]>([]);
  const [selected, setSelected] = useState<Forum | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const loadForums = useCallback(async () => { try { setForums(await adminRequest<Forum[]>('/api/admin/forums')); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void loadForums(); }, [loadForums]);
  const loadPosts = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try { setPosts(await adminRequest<Post[]>(`/api/admin/forums/${selected.id}/posts`)); }
    catch (e) { notify((e as Error).message, 'error'); }
    setLoading(false);
  }, [selected, notify]);
  useEffect(() => { void loadPosts(); }, [loadPosts]);
  const deletePost = async (post: Post) => {
    if (!window.confirm(`Удалить сообщение пользователя «${post.user_name}»?`)) return;
    try { await adminRequest(`/api/admin/forums/posts/${post.id}`, { method: 'DELETE' }); notify('Сообщение удалено'); await loadPosts(); await loadForums(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const deleteForum = async (forum: Forum) => {
    if (!window.confirm(`Удалить форум «${forum.name}» и его сообщения?`)) return;
    try { await adminRequest(`/api/admin/forums/${forum.id}`, { method: 'DELETE' }); setSelected(null); notify('Форум удалён'); await loadForums(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  return <>
    <AdminTitle title="Модерация форумов" detail="Откройте форум, чтобы проверить сообщения и вложения." />
    <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
      <div className={`${adminCard} overflow-hidden`}>
        <div className="px-4 py-3 bg-surface border-b-2 border-ink font-display text-[14px]">Темы</div>
        {forums.length === 0 ? <div className="p-4"><AdminEmpty>Форумов нет</AdminEmpty></div> : forums.map((f) => <div key={f.id} className={`flex gap-2 items-center p-3 border-b border-ink/10 ${selected?.id === f.id ? 'bg-sun/45' : ''}`}><button onClick={() => setSelected(f)} className="min-w-0 flex-1 text-left cursor-pointer"><b className="block truncate text-[12px]">{f.name}</b><span className="text-[10px] text-muted">{f.post_count || 0} сообщений</span></button><button onClick={() => void deleteForum(f)} className={`${adminDanger} !px-2`} title="Удалить форум"><Trash2 size={13} /></button></div>)}
      </div>
      <div className={`${adminCard} overflow-hidden min-h-[420px]`}>
        {!selected ? <div className="min-h-[420px] grid place-items-center text-center p-8"><div><div className="w-14 h-14 bg-surface border-2 border-ink rounded-full mx-auto grid place-items-center"><MessageCircle size={24} /></div><h2 className="font-display text-[17px] mt-3">Выберите тему форума</h2><p className="text-[12px] text-muted mt-1">Сообщения и фото появятся здесь.</p></div></div> : <>
          <div className="px-4 py-3 bg-surface border-b-2 border-ink flex items-center gap-3"><div className="min-w-0 flex-1"><h2 className="font-display text-[16px]">{selected.name}</h2><p className="text-[10px] text-muted">{selected.description}</p></div><AdminBadge>{posts.length}</AdminBadge></div>
          {loading ? <div className="py-16 grid place-items-center"><LoaderCircle className="animate-spin" /></div> : posts.length === 0 ? <div className="p-6"><AdminEmpty>В этом форуме пока пусто</AdminEmpty></div> : <div className="p-4 space-y-3 max-h-[72vh] overflow-y-auto">{posts.map((post) => <article key={post.id} className="rounded-[16px] border-2 border-ink/10 bg-white p-4"><div className="flex gap-3 items-center"><Avatar name={post.user_name || 'Участник'} size={36} /><div className="min-w-0 flex-1"><b className="text-[12px]">{post.user_name || 'Участник'}</b><div className="text-[10px] text-muted">{dateLabel(post.created_at)} · #{post.id}</div></div><button onClick={() => void deletePost(post)} className={adminDanger}><Trash2 size={13} />Удалить</button></div><p className="text-[13px] whitespace-pre-line break-words mt-3">{post.text}</p><AttachedImages images={post.images} size="sm" className="mt-2" /></article>)}</div>}
        </>}
      </div>
    </div>
  </>;
}

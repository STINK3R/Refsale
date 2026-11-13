/* eslint-disable react-hooks/set-state-in-effect -- These effects start async API reads; state changes follow awaited responses. */
import { useCallback, useEffect, useState } from 'react';
import { Eye, RefreshCw, X } from 'lucide-react';
import { adminRequest } from '../../api/adminClient';
import type { AdminNotice } from './AdminApp';
import { adminCard, adminInput, adminSecondary, AdminBadge, AdminEmpty, AdminTitle, dateLabel } from './AdminUi';
import Avatar from '../ui/Avatar';
import AttachedImages from '../ui/AttachedImages';
import { unescapeHtml } from '../../utils/format';

type Person = { id: number; name: string; avatar_url: string; role: string };
type Conversation = { id: number; participants: Person[]; last_at: string | null; last_sender: string; last_text: string; message_count: number };
type Message = { id: number; sender_id: number; sender_name: string; avatar_url: string; sender_role: string; text: string; images: string; created_at: string };

/** Private supplier ↔ leader conversations, for the platform to read. Read-only:
 *  the admin neither writes there nor marks anything as read for the participants. */
export default function AdminPartnerChats({ notify }: { notify: AdminNotice }) {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Conversation | null>(null);
  const load = useCallback(async () => {
    try { setItems(await adminRequest<Conversation[]>('/api/admin/partner-chats')); }
    catch (e) { notify((e as Error).message, 'error'); }
    setLoaded(true);
  }, [notify]);
  useEffect(() => { void load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = items.filter((c) => !needle || `${c.participants.map((p) => p.name).join(' ')} ${c.last_text} ${c.id}`.toLowerCase().includes(needle));
  return <>
    <AdminTitle
      title="Чаты участников"
      detail="Личные диалоги поставщиков и лидеров мнений. Только просмотр: участники не видят, что диалог открыт."
      action={<button onClick={() => void load()} className={adminSecondary}><RefreshCw size={14} />Обновить</button>}
    />
    <input value={q} onChange={(e) => setQ(e.target.value)} className={`${adminInput} max-w-[360px] mb-4`} placeholder="Имя участника или текст" />
    {!loaded ? null : shown.length === 0 ? <AdminEmpty>{items.length ? 'Ничего не найдено' : 'Участники ещё не переписывались'}</AdminEmpty> : <div className={`${adminCard} overflow-hidden`}>
      <div className="grid grid-cols-[1.4fr_1.6fr_90px_150px] gap-3 px-5 py-3 bg-surface text-[10px] uppercase tracking-[.1em] font-bold text-muted max-md:hidden"><span>Участники</span><span>Последнее сообщение</span><span>Сообщений</span><span>Обновлено</span></div>
      {shown.map((c) => <button key={c.id} onClick={() => setOpen(c)} className="w-full grid grid-cols-[1.4fr_1.6fr_90px_150px] max-md:grid-cols-1 gap-3 px-5 py-4 text-left border-t border-ink/10 items-center cursor-pointer hover:bg-surface/60">
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex -space-x-2 shrink-0">{c.participants.map((p) => <Avatar key={p.id} name={p.name} url={p.avatar_url} size={30} />)}</span>
          <span className="min-w-0"><span className="block font-semibold text-[13px] truncate">{c.participants.map((p) => p.name).join(' ↔ ')}</span><span className="block text-[11px] text-muted truncate">{c.participants.map((p) => p.role).join(' · ')}</span></span>
        </span>
        <span className="text-[12px] text-muted truncate">{c.last_sender ? <b className="text-ink font-semibold">{c.last_sender}: </b> : null}{unescapeHtml(c.last_text || '—')}</span>
        <span><AdminBadge>{c.message_count}</AdminBadge></span>
        <span className="text-[11px] text-muted">{dateLabel(c.last_at)}</span>
      </button>)}
    </div>}
    {open && <ConversationDrawer conversation={open} onClose={() => setOpen(null)} notify={notify} />}
  </>;
}

function ConversationDrawer({ conversation, onClose, notify }: { conversation: Conversation; onClose: () => void; notify: AdminNotice }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const first = conversation.participants[0]?.id;
  const load = useCallback(async () => {
    try { setMessages((await adminRequest<{ messages: Message[] }>(`/api/admin/partner-chats/${conversation.id}/messages`)).messages || []); }
    catch (e) { notify((e as Error).message, 'error'); }
  }, [conversation.id, notify]);
  useEffect(() => { void load(); const t = setInterval(load, 12000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="fixed inset-0 z-[90] bg-ink/45 backdrop-blur-sm flex justify-end" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><aside className="w-[min(720px,100vw)] h-full bg-card border-l-2 border-ink flex flex-col">
    <header className="p-4 sm:px-5 bg-sun border-b-2 border-ink flex gap-3 items-start">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[.14em] text-ink/60 font-bold">Диалог #{conversation.id}</div>
        <h2 className="font-display text-[20px] leading-tight">{conversation.participants.map((p) => p.name).join(' ↔ ')}</h2>
        <p className="text-[11px] text-ink/70 mt-1">{conversation.participants.map((p) => `${p.name} — ${p.role}`).join(' · ')}</p>
      </div>
      <button onClick={onClose} className="w-9 h-9 rounded-full border-2 border-ink bg-card grid place-items-center" aria-label="Закрыть"><X size={17} /></button>
    </header>
    <div className="px-4 py-2.5 flex items-center gap-2 border-b border-ink/10 text-[11px] text-muted"><Eye size={14} />Только просмотр. Прочтение здесь не меняет индикаторы у участников.</div>
    <div className="chat-bg flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 ? <div className="text-center text-[12px] text-muted mt-8">Сообщений пока нет.</div> : messages.map((m) => {
        const left = m.sender_id === first;
        return <div key={m.id} className={`flex items-end gap-2 ${left ? '' : 'flex-row-reverse'}`}>
          <Avatar name={m.sender_name || 'Участник'} url={m.avatar_url} size={30} />
          <div className={`max-w-[82%] rounded-[16px] border px-3.5 py-2.5 ${left ? 'bg-card border-ink/15 rounded-bl-[6px]' : 'bg-[#DCEBFF] border-[#9DC3F0] rounded-br-[6px]'}`}>
            <div className="text-[10px] font-bold text-[#1B5BB0]">{m.sender_name}{m.sender_role ? ` · ${m.sender_role}` : ''}</div>
            {m.text && <div className="text-[13px] whitespace-pre-line break-words">{unescapeHtml(m.text)}</div>}
            <AttachedImages images={m.images} size="sm" className="mt-1.5" />
            <div className="text-[9px] text-light text-right mt-1">{dateLabel(m.created_at)}</div>
          </div>
        </div>;
      })}
    </div>
  </aside></div>;
}

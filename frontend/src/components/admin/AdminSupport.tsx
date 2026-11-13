/* eslint-disable react-hooks/set-state-in-effect -- These effects start async API reads; state changes follow awaited responses. */
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Paperclip, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { adminRequest, adminUpload } from '../../api/adminClient';
import type { AdminNotice } from './AdminApp';
import type { SupportMessage, SupportTicket } from '../../types';
import { adminCard, adminInput, adminArea, adminPrimary, adminSecondary, AdminBadge, AdminEmpty, AdminTitle, dateLabel, useAdminTab, useEscape } from './AdminUi';
import AdminPartnerChats from './AdminPartnerChats';
import Avatar from '../ui/Avatar';
import AttachedImages from '../ui/AttachedImages';
import { unescapeHtml } from '../../utils/format';

type TicketRow = SupportTicket & { admin_unread?: boolean };
const ticketState: Record<string, { label: string; tone: 'blue' | 'amber' | 'default' }> = { open: { label: 'Открыт', tone: 'blue' }, in_progress: { label: 'В работе', tone: 'amber' }, closed: { label: 'Закрыт', tone: 'default' } };

export default function AdminSupport({ notify }: { notify: AdminNotice }) {
  const [tab] = useAdminTab(2);
  return tab === 1 ? <AdminPartnerChats notify={notify} /> : <SupportTickets notify={notify} />;
}

function SupportTickets({ notify }: { notify: AdminNotice }) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [q, setQ] = useState('');
  const load = useCallback(async () => { try { setTickets(await adminRequest<TicketRow[]>('/api/admin/support/tickets')); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); const timer = setInterval(load, 18000); return () => clearInterval(timer); }, [load]);
  const shown = tickets.filter((t) => (filter === 'all' || (filter === 'unread' ? t.admin_unread : t.status === filter)) && (!q || `${t.subject} ${t.user_name} ${t.id}`.toLowerCase().includes(q.toLowerCase())));
  return <>
    <AdminTitle title="Обращения покупателей" detail="Непрочитанные обращения подсвечены, список обновляется автоматически." action={<button onClick={() => void load()} className={adminSecondary}><RefreshCw size={14} />Обновить</button>} />
    <div className="flex gap-2 flex-wrap mb-4"><select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${adminInput} !w-auto`}><option value="all">Все статусы</option><option value="unread">Новые сообщения</option><option value="open">Открытые</option><option value="in_progress">В работе</option><option value="closed">Закрытые</option></select><input value={q} onChange={(e) => setQ(e.target.value)} className={`${adminInput} max-w-[360px]`} placeholder="Тема, имя или номер" /></div>
    {shown.length === 0 ? <AdminEmpty>Обращений по этому фильтру нет</AdminEmpty> : <div className={`${adminCard} overflow-hidden`}>
      <div className="grid grid-cols-[80px_1.3fr_1fr_130px_155px] gap-3 px-5 py-3 bg-surface text-[10px] uppercase tracking-[.1em] font-bold text-muted max-md:hidden"><span>№</span><span>Тема</span><span>Покупатель</span><span>Статус</span><span>Обновлено</span></div>
      {shown.map((t) => <button key={t.id} onClick={() => setSelected(t)} className={`relative w-full grid grid-cols-[80px_1.3fr_1fr_130px_155px] max-md:grid-cols-2 gap-3 px-5 py-4 text-left border-t border-ink/10 items-center cursor-pointer ${t.admin_unread ? 'bg-[#FFF0EF] hover:bg-[#FFE4E1]' : 'hover:bg-surface/60'}`}>
        {t.admin_unread && <i className="absolute left-0 inset-y-1 w-1.5 rounded-r-full bg-danger" />}
        <span className="font-bold">#{t.id}{t.admin_unread && <i className="inline-block ml-2 w-2 h-2 rounded-full bg-danger" title="Новое сообщение" />}</span><span className="font-semibold truncate text-[13px]">{t.subject || 'Обращение'}</span><span className="text-[12px] text-muted truncate">{t.user_name || 'Покупатель'}</span><span><AdminBadge tone={ticketState[t.status]?.tone || 'default'}>{ticketState[t.status]?.label || t.status}</AdminBadge></span><span className="text-[11px] text-muted">{dateLabel(t.updated_at)}</span>
      </button>)}
    </div>}
    {selected && <TicketDrawer ticket={selected} onClose={() => setSelected(null)} onChanged={load} notify={notify} />}
  </>;
}

function TicketDrawer({ ticket, onClose, onChanged, notify }: { ticket: TicketRow; onClose: () => void; onChanged: () => void; notify: AdminNotice }) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [status, setStatus] = useState<string>(ticket.status);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const result = await adminRequest<SupportMessage[]>(`/api/support/tickets/${ticket.id}/messages`); setMessages(result || []); }
    catch (e) { notify((e as Error).message, 'error'); }
  }, [ticket.id, notify]);
  useEffect(() => { void load(); const timer = setInterval(load, 12000); return () => clearInterval(timer); }, [load]);
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 4 - images.length)); e.target.value = '';
    for (const file of files) { try { const result = await adminUpload(file, 'support'); setImages((current) => current.length < 4 ? [...current, result.url] : current); } catch (err) { notify((err as Error).message, 'error'); } }
  };
  const send = async () => {
    if ((!text.trim() && !images.length) || busy) return;
    setBusy(true);
    try { await adminRequest(`/api/support/tickets/${ticket.id}/messages`, { method: 'POST', body: JSON.stringify({ sender_type: 'admin', sender_name: 'RefSale', text: text.trim(), images }) }); setText(''); setImages([]); await load(); onChanged(); }
    catch (e) { notify((e as Error).message, 'error'); }
    setBusy(false);
  };
  const setTicketStatus = async (next: string) => { try { await adminRequest(`/api/admin/support/tickets/${ticket.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); setStatus(next); onChanged(); } catch (e) { notify((e as Error).message, 'error'); } };
  const deleteMessage = async (id: number) => {
    if (!window.confirm('Удалить сообщение из обращения?')) return;
    try { await adminRequest(`/api/admin/support/messages/${id}`, { method: 'DELETE' }); await load(); onChanged(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  useEscape(onClose);
  return <div className="fixed inset-0 z-[90] bg-ink/45 backdrop-blur-sm flex justify-end" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><aside className="w-[min(720px,100vw)] h-full bg-card border-l-2 border-ink flex flex-col">
    <header className="p-4 sm:px-5 bg-sun border-b-2 border-ink flex gap-3 items-start"><div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-[.14em] text-ink/60 font-bold">Обращение #{ticket.id}</div><h2 className="font-display text-[20px] leading-tight">{ticket.subject}</h2><p className="text-[11px] text-ink/70 mt-1">{ticket.user_name} · создано {dateLabel(ticket.created_at)}</p></div><button onClick={onClose} className="w-9 h-9 rounded-full border-2 border-ink bg-card grid place-items-center"><X size={17} /></button></header>
    <div className="px-4 py-3 flex gap-2 items-center border-b border-ink/10"><span className="text-[10px] font-bold text-muted">Статус</span><select value={status} onChange={(e) => void setTicketStatus(e.target.value)} className={`${adminInput} !w-auto !h-9`}>{Object.entries(ticketState).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}</select><span className="ml-auto text-[10px] text-muted">Обновлено {dateLabel(ticket.updated_at)}</span></div>
    <div className="chat-bg flex-1 min-h-0 overflow-y-auto p-4 space-y-3">{messages.length === 0 ? <div className="text-center text-[12px] text-muted mt-8">Сообщений пока нет.</div> : messages.map((m) => { const mine = m.sender_type === 'admin'; return <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}><Avatar name={m.sender_name || 'Участник'} url={(m as SupportMessage & { avatar_url?: string }).avatar_url || (mine ? '/img/logo-meerkat.webp' : undefined)} size={30} /><div className={`max-w-[82%] rounded-[16px] border px-3.5 py-2.5 ${mine ? 'bg-[#DCEBFF] border-[#9DC3F0] rounded-br-[6px]' : 'bg-card border-ink/15 rounded-bl-[6px]'}`}><div className="text-[10px] font-bold text-[#1B5BB0]">{m.sender_name || 'Покупатель'}</div>{m.text && <div className="text-[13px] whitespace-pre-line break-words">{unescapeHtml(m.text)}</div>}<AttachedImages images={m.images} size="sm" className="mt-1.5" /><div className="flex items-center justify-end gap-2 mt-1"><div className="text-[9px] text-light">{dateLabel(m.created_at)}</div><button type="button" onClick={() => void deleteMessage(m.id)} className="text-danger/70 hover:text-danger" aria-label="Удалить сообщение" title="Удалить сообщение"><Trash2 size={12} /></button></div></div></div>; })}</div>
    <footer className="p-3 border-t-2 border-ink/10 bg-card">{images.length > 0 && <div className="flex gap-2 mb-2 flex-wrap">{images.map((url) => <span key={url} className="rounded-full bg-surface px-2 py-1 text-[10px]">{url.split('/').pop()}<button onClick={() => setImages((x) => x.filter((u) => u !== url))}><X size={11} /></button></span>)}</div>}<div className="flex gap-2 items-end"><label className={`${adminSecondary} !w-10 !h-10 !p-0 cursor-pointer`}><Paperclip size={16} /><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={upload} className="hidden" /></label><textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Ответить покупателю…" className={`${adminArea} resize-none`} /><button onClick={() => void send()} disabled={busy || (!text.trim() && !images.length)} className={`${adminPrimary} !w-10 !h-10 !p-0`}><Send size={16} /></button></div></footer>
  </aside></div>;
}

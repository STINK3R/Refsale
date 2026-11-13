import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Send, MessageCircle, Loader2, UserRound, UsersRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Avatar from '../ui/Avatar';
import AttachedImages from '../ui/AttachedImages';
import ImageUploader from '../ui/ImageUploader';
import { useAuthStore, useNotificationStore } from '../../store';
import {
  fetchPartnerContacts, fetchPartnerConversations, fetchPartnerMessages,
  openPartnerConversation, sendPartnerMessage,
} from '../../api/client';
import type { PartnerChatMessage, PartnerChatParticipant, PartnerConversation } from '../../types';
import { unescapeHtml } from '../../utils/format';

const plate = 'bg-card border-2 border-ink rounded-[22px] max-sm:rounded-[18px] shadow-[0_4px_0_#111]';

function when(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** A private inbox shared by the supplier and opinion-leader cabinets. */
export default function PartnerChatPanel({ embedded = false }: { embedded?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const show = useNotificationStore((s) => s.show);
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState<PartnerConversation[]>([]);
  const [contacts, setContacts] = useState<PartnerChatParticipant[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [messages, setMessages] = useState<PartnerChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'chats' | 'contacts'>('chats');
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => conversations.find((c) => c.id === active), [conversations, active]);

  const loadConversations = useCallback(async () => {
    const list = await fetchPartnerConversations();
    setConversations(list);
    return list;
  }, []);

  const loadMessages = useCallback(async (id: number) => {
    const list = await fetchPartnerMessages(id);
    setMessages(list);
    setConversations((all) => all.map((c) => c.id === id ? { ...c, unread: false } : c));
    // Opening a thread marks it read: the cabinet's tab badge updates at once
    window.dispatchEvent(new Event('refsale:partner-chat-read'));
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      await loadConversations();
      if (live) setLoading(false);
    })();
    const timer = window.setInterval(() => {
      void loadConversations();
      if (active) void loadMessages(active);
    }, 12000);
    return () => { live = false; window.clearInterval(timer); };
  }, [loadConversations, loadMessages, active]);

  useEffect(() => {
    if (active) void loadMessages(active);
    else setMessages([]);
  }, [active, loadMessages]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    const deepLink = Number(params.get('partner_chat'));
    if (!deepLink) return;
    setActive(deepLink);
    const next = new URLSearchParams(params);
    next.delete('partner_chat');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'contacts') return;
    let live = true;
    const timer = window.setTimeout(() => {
      void fetchPartnerContacts(query).then((list) => { if (live) setContacts(list); });
    }, 180);
    return () => { live = false; window.clearTimeout(timer); };
  }, [mode, query]);

  const chooseContact = async (person: PartnerChatParticipant) => {
    const result = await openPartnerConversation(person.id);
    if (!result.id) { show(result.error || 'Не удалось открыть диалог', 'error'); return; }
    await loadConversations();
    setMode('chats');
    setActive(result.id);
  };

  const send = async () => {
    if (!active || (!text.trim() && images.length === 0) || sending) return;
    setSending(true);
    try {
      const msg = await sendPartnerMessage(active, text.trim(), images);
      setMessages((prev) => [...prev, msg]);
      setText(''); setImages([]);
      await loadConversations();
    } catch (e) { show((e as Error).message || 'Не удалось отправить сообщение', 'error'); }
    setSending(false);
  };

  const list = mode === 'chats' ? conversations.filter((c) => !query || c.other_name.toLowerCase().includes(query.toLowerCase())) : contacts;
  const content = (
    <div className={`${plate} overflow-hidden grid grid-cols-[minmax(230px,0.85fr)_minmax(0,1.6fr)] max-md:grid-cols-1 min-h-[520px]`}>
      <aside className="min-w-0 border-r-2 border-ink/10 max-md:border-r-0 max-md:border-b-2 max-md:border-ink/10 flex flex-col max-md:max-h-[230px]">
        <div className="p-4 border-b border-ink/10">
          <div className="flex gap-2 mb-3">
            <button onClick={() => { setMode('chats'); setQuery(''); }} className={`flex-1 rounded-full border px-3 py-2 text-[12px] font-bold ${mode === 'chats' ? 'bg-ink text-sun border-ink' : 'bg-surface border-ink/10 text-ink'}`}>Диалоги</button>
            <button onClick={() => { setMode('contacts'); setQuery(''); }} className={`flex-1 rounded-full border px-3 py-2 text-[12px] font-bold ${mode === 'contacts' ? 'bg-ink text-sun border-ink' : 'bg-surface border-ink/10 text-ink'}`}>Участники</button>
          </div>
          <label className="field !h-10 !py-0 flex items-center gap-2">
            <Search size={15} className="text-muted shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти участника" className="bg-transparent border-0 outline-none w-full min-w-0 text-[13px]" />
          </label>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && mode === 'chats' ? <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-primary" /></div>
            : list.length === 0 ? <div className="p-5 text-center text-[12px] text-muted">{mode === 'chats' ? 'Диалогов пока нет. Выберите участника, чтобы написать.' : 'Никого не нашли.'}</div>
              : mode === 'chats' ? (list as PartnerConversation[]).map((c) => (
                <button key={c.id} onClick={() => setActive(c.id)} className={`w-full p-3.5 flex items-center gap-3 text-left border-0 border-b border-ink/[0.07] cursor-pointer transition-colors ${active === c.id ? 'bg-sun/50' : 'bg-transparent hover:bg-surface/70'}`}>
                  <Avatar name={c.other_name} url={c.other_avatar} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><b className="truncate text-[13px] text-ink">{c.other_name}</b>{c.unread && <i className="w-2.5 h-2.5 bg-danger rounded-full shrink-0" aria-label="Новое сообщение" />}</span>
                    <span className="block text-[10px] text-muted truncate">{c.other_role}</span>
                    <span className="block text-[11px] text-muted truncate mt-0.5">{c.last_text || 'Диалог создан'} · {when(c.last_at)}</span>
                  </span>
                </button>
              )) : (list as PartnerChatParticipant[]).map((c) => (
                <button key={c.id} onClick={() => void chooseContact(c)} className="w-full p-3.5 flex items-center gap-3 text-left border-0 border-b border-ink/[0.07] cursor-pointer bg-transparent hover:bg-surface/70 transition-colors">
                  <Avatar name={c.name} url={c.avatar_url} size={40} />
                  <span className="min-w-0 flex-1"><b className="block truncate text-[13px] text-ink">{c.name}</b><span className="text-[10px] text-muted">{c.role}</span></span>
                  <MessageCircle size={16} className="text-primary shrink-0" />
                </button>
              ))}
        </div>
      </aside>

      <section className="min-w-0 flex flex-col min-h-[520px] max-md:min-h-[440px]">
        {selected ? <>
          <header className="px-5 py-3.5 flex items-center gap-3 border-b-2 border-ink bg-accent">
            <Avatar name={selected.other_name} url={selected.other_avatar} size={40} />
            <div className="min-w-0"><div className="font-bold text-[14px] truncate">{selected.other_name}</div><div className="text-[11px] text-ink/65">{selected.other_role}</div></div>
            <UsersRound size={17} className="ml-auto text-ink/55" />
          </header>
          <div className="chat-bg p-4 flex-1 min-h-0 overflow-y-auto space-y-3">
            {messages.length === 0 && <div className="mx-auto w-fit mt-5 rounded-full px-4 py-2 bg-card/90 text-[12px] text-muted">Начните диалог — контакты останутся скрыты</div>}
            <div className="mx-auto w-fit rounded-full px-3 py-1 bg-card/80 text-[10.5px] text-muted">Переписка видна только вам двоим и модераторам площадки</div>
            {messages.map((msg) => {
              const mine = msg.sender_id === user?.id;
              return <div key={msg.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar name={mine ? (user?.full_name || msg.sender_name) : msg.sender_name} url={mine ? user?.avatar_url : msg.avatar_url} size={30} />
                <div className={`max-w-[82%] min-w-0 rounded-[16px] border px-3.5 py-2.5 shadow-sm ${mine ? 'bg-[#DCEBFF] border-[#9DC3F0] rounded-br-[6px]' : 'bg-card border-ink/15 rounded-bl-[6px]'}`}>
                  <div className={`text-[10px] font-bold mb-0.5 ${mine ? 'text-[#1B5BB0]' : 'text-primary-dark'}`}>{mine ? 'Вы' : `${msg.sender_name} · ${msg.sender_role}`}</div>
                  {msg.text && <div className="whitespace-pre-line break-words text-[13px] leading-relaxed">{unescapeHtml(msg.text)}</div>}
                  <AttachedImages images={msg.images} size="sm" className="mt-1.5" />
                  <div className="text-[9.5px] text-light text-right mt-1">{when(msg.created_at)}</div>
                </div>
              </div>;
            })}
            <div ref={bottom} />
          </div>
          <footer className="p-3 border-t-2 border-ink/10 bg-card">
            {!!images.length && user?.id && <div className="mb-2"><ImageUploader value={images} onChange={setImages} userId={user.id} prefix="partner_chat" max={4} compact video /></div>}
            <div className="flex items-center gap-2">
              {!images.length && user?.id && <ImageUploader value={images} onChange={setImages} userId={user.id} prefix="partner_chat" max={4} compact video />}
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Сообщение…" className="field !py-2.5" aria-label="Сообщение участнику" />
              <button onClick={() => void send()} disabled={(!text.trim() && images.length === 0) || sending} className="btn-primary w-11 h-11 !p-0 shrink-0" aria-label="Отправить"><Send size={17} /></button>
            </div>
          </footer>
        </> : <div className="flex-1 grid place-items-center p-6 text-center chat-bg">
          <div><div className="w-14 h-14 rounded-full bg-sun border-2 border-ink grid place-items-center mx-auto mb-3"><UserRound size={24} /></div><div className="font-display text-[18px]">Личные сообщения</div><p className="text-[12px] text-muted max-w-[300px] mt-2">Поставщики и лидеры мнений могут обсудить сотрудничество и доставку, не раскрывая личные контакты. Площадка может просматривать переписку для модерации.</p></div>
        </div>}
      </section>
    </div>
  );

  return embedded ? content : (
    <div className="max-w-[1240px] mx-auto px-5 max-sm:px-3 py-6">
      <div className="bg-sun border-2 border-ink rounded-[22px] shadow-[0_5px_0_#111] p-5 mb-5">
        <div className="text-[11px] uppercase tracking-[0.14em] font-bold text-ink/65 mb-1">Рабочие сообщения</div>
        <h2 className="font-display text-[24px] leading-tight">Поставщики и лидеры мнений</h2>
      </div>
      {content}
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import Meerkat from '../mascot/Meerkat';
import { Package, Loader2, Send, ArrowLeft, MessageCircle, LogIn, ChevronDown, Check, X, BadgePercent } from 'lucide-react';
import { useAuthStore, useNotificationStore } from '../../store';
import { fetchUserOrderChats, fetchOrderMessages, sendOrderMessage, cancelStoreOrder } from '../../api/client';
import ImageUploader from '../ui/ImageUploader';
import NotifyPrompt from '../ui/NotifyPrompt';
import AttachedImages from '../ui/AttachedImages';
import { formatPrice, unescapeHtml } from '../../utils/format';
import type { OrderChatSummary, OrderChatMessage, OrderItem } from '../../types';

export const STATUS_LABEL: Record<string, string> = {
  new: 'Ожидает подтверждения',
  accepted: 'Принят',
  processing: 'В обработке',
  shipping: 'В доставке',
  done: 'Выдан',
  cancelled: 'Отменён',
};
export const STATUS_STEPS = ['accepted', 'processing', 'shipping', 'done'];
const CLOSED = new Set(['done', 'cancelled']);

export function statusTone(status: string) {
  if (status === 'cancelled') return 'text-danger bg-danger/10 border-danger/25';
  if (status === 'done') return 'text-success bg-success/10 border-success/25';
  if (status === 'new') return 'text-muted bg-ink/[0.05] border-ink/10';
  return 'text-primary-light bg-primary/12 border-primary/30';
}

export function parseItems(raw: string): OrderItem[] {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || []); } catch { return []; }
}

function chatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

/** "16.10.26" and "15:14" for under a step. */
function stepTime(iso?: string): [string, string] | null {
  if (!iso) return null;
  const d = new Date(iso);
  return [
    d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  ];
}

/** What happens next while the order waits for the manager, said in bold. */
const WAITING_STEPS = [
  'Менеджер напишет здесь, в чате: подтвердит наличие и сроки',
  'Пришлёт реквизиты — оплатите заказ',
  'После оплаты заказ подтвердят, и здесь появятся статусы с датами',
];

/**
 * принят → в обработке → в доставке → выдан, each with the date and time it
 * was reached, so the buyer sees the order moving. Before confirmation: what
 * happens next.
 */
export function StatusTrack({ status, history = {} }: { status: string; history?: Record<string, string> }) {
  if (status === 'new') {
    const created = stepTime(history.new);
    return (
      <div className="rounded-[16px] border-2 border-ink bg-accent-strong px-4 py-3.5">
        <div className="text-[14px] font-extrabold text-ink">Что дальше{created ? <span className="font-semibold text-ink/70"> · заказ создан {created[0]} в {created[1]}</span> : null}</div>
        <ol className="mt-2 space-y-1.5">
          {WAITING_STEPS.map((t, n) => (
            <li key={t} className="flex gap-2.5 text-[13px] font-semibold text-ink leading-snug">
              <span className="w-5 h-5 shrink-0 rounded-[6px] bg-ink text-sun text-[11px] font-extrabold flex items-center justify-center">{n + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (status === 'cancelled') {
    const at = stepTime(history.cancelled);
    return <div className="text-[13px] font-semibold text-danger">Заказ отменён{at ? ` ${at[0]} в ${at[1]}` : ''}</div>;
  }
  const reached = STATUS_STEPS.indexOf(status);
  return (
    <div className="flex items-start gap-1.5">
      {STATUS_STEPS.map((s, i) => {
        const at = i <= reached ? stepTime(history[s]) : null;
        return (
          <div key={s} className="flex-1 min-w-0">
            <div className={`h-1.5 rounded-full ${i <= reached ? 'bg-primary' : 'bg-ink/10'}`} />
            <div className={`mt-1.5 text-[11px] truncate ${i <= reached ? 'text-primary-dark font-bold' : 'text-light'}`}>{STATUS_LABEL[s]}</div>
            {at && (
              <div className="text-[10.5px] leading-tight text-muted tabular-nums">
                <div>{at[0]}</div>
                <div>{at[1]}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersPage() {
  const { user, openAuth } = useAuthStore();
  const [chats, setChats] = useState<OrderChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OrderChatSummary | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadChats = useCallback(async (silent?: boolean) => {
    if (!user?.id) return;
    if (!silent) setLoading(true);
    setChats(await fetchUserOrderChats(user.id));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void loadChats();
    const t = setInterval(() => loadChats(true), 20000);
    return () => clearInterval(t);
  }, [loadChats]);

  useEffect(() => {
    const oid = searchParams.get('order');
    if (oid && chats.length && !selected) {
      const found = chats.find((c) => String(c.order_id) === oid);
      if (found) setSelected(found);
    }
  }, [searchParams, chats, selected]);

  const openChat = (c: OrderChatSummary) => {
    setSelected(c);
    setChats((prev) => prev.map((x) => (x.order_id === c.order_id ? { ...x, unread: false } : x)));
  };

  const closeChat = () => {
    setSelected(null);
    if (searchParams.get('order')) setSearchParams({});
    void loadChats(true);
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-[calc(var(--header-h,104px)+56px)] pb-24 text-center">
        <Meerkat pose="boxes" width={150} decorative className="mx-auto mb-5" />
        <h1 className="font-display text-[38px] leading-none text-text mb-3">Сообщения и заказы</h1>
        <p className="text-sm text-muted mb-7">Войдите, чтобы видеть свои заказы, их статусы и чат с менеджером.</p>
        <button onClick={() => openAuth('login')} className="btn-primary px-8 h-12 text-[15px]"><LogIn size={17} /> Войти</button>
      </div>
    );
  }

  return (
    <div className="max-w-[1180px] mx-auto px-3 sm:px-5 pt-[calc(var(--header-h,104px)+28px)] pb-16">
      <div className="mb-5 px-1">
        <div className="label mb-2">Мои заказы</div>
        <h1 className="font-display text-[40px] leading-none text-text max-sm:text-[32px]">Статусы и чаты</h1>
      </div>

      <div className="bg-card border border-line overflow-hidden flex h-[calc(100dvh-220px)] min-h-[480px] max-h-[760px]">
        <aside className={`w-full sm:w-[340px] sm:min-w-[340px] sm:border-r border-ink/[0.07] flex-col ${selected ? 'hidden sm:flex' : 'flex'}`}>
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
            ) : chats.length === 0 ? (
              <div className="text-center py-16 px-6 text-[13px] text-muted leading-relaxed">
                <Meerkat pose="boxes" width={110} decorative className="mx-auto mb-4" />
                Заказов пока нет. После оформления здесь появится чат с менеджером и статусы.
              </div>
            ) : chats.map((c) => {
              const active = selected?.order_id === c.order_id;
              const preview = c.last_text ? (c.last_sender === 'user' ? 'Вы: ' : '') + c.last_text : 'Напишите менеджеру';
              return (
                <button
                  key={c.order_id}
                  onClick={() => openChat(c)}
                  className={`w-full text-left px-4 py-3.5 border-b border-ink/[0.05] cursor-pointer transition-colors ${active ? 'bg-primary/10' : 'hover:bg-ink/[0.03]'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-text flex items-center gap-2">
                      Заказ #{c.order_id}
                      {c.unread && <span className="w-2 h-2 rounded-full bg-danger" />}
                    </span>
                    <span className="text-[11px] text-light">{chatTime(c.last_at || c.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className={`text-[12px] truncate ${c.unread ? 'text-text font-semibold' : 'text-muted'}`}>{preview}</span>
                    <span className={`text-[10px] font-medium uppercase tracking-[0.08em] px-2 py-0.5 border shrink-0 ${statusTone(c.status)}`}>{STATUS_LABEL[c.status] || c.status}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={`flex-1 min-w-0 flex-col ${selected ? 'flex' : 'hidden sm:flex'}`}>
          {selected ? (
            <OrderThread key={selected.order_id} chat={selected} userId={user.id} userName={user.full_name} onBack={closeChat} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-muted">
              <MessageCircle size={34} className="text-primary/40 mb-3" />
              <p className="text-[14px]">Выберите заказ слева — откроется статус и чат с менеджером</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function OrderThread({ chat, userId, userName, onBack }: { chat: OrderChatSummary; userId: number; userName: string; onBack: () => void }) {
  const show = useNotificationStore((s) => s.show);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [status, setStatus] = useState<string>(chat.status);
  const [history, setHistory] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const items = parseItems(chat.items);
  const closed = CLOSED.has(status);

  const load = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    const res = await fetchOrderMessages(chat.order_id, userId);
    setMessages(res.messages);
    if (res.status) setStatus(res.status);
    if (res.history) setHistory(res.history);
    setLoading(false);
  }, [chat.order_id, userId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => load(true), 12000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    if ((!text.trim() && !images.length) || sending) return;
    setSending(true);
    try {
      const msg = await sendOrderMessage(chat.order_id, { user_id: userId, sender_name: userName, text: text.trim(), images });
      setMessages((prev) => [...prev, msg]);
      setText('');
      setImages([]);
    } catch (e) {
      show((e as Error).message || 'Не удалось отправить сообщение', 'error');
    }
    setSending(false);
  };

  const cancel = async () => {
    if (!window.confirm(`Отменить заказ #${chat.order_id}?`)) return;
    const res = await cancelStoreOrder(chat.order_id);
    if (res.error) { show(res.error, 'error'); return; }
    show('Заказ отменён');
    void load(true);
  };

  return (
    <>
      <div className="shrink-0 border-b border-ink/[0.07] px-4 py-3.5 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="sm:hidden w-8 h-8 rounded-ctl-xs bg-ink/5 flex items-center justify-center text-muted cursor-pointer" aria-label="Назад"><ArrowLeft size={16} /></button>
          <div className="flex-1 min-w-0">
            <div className="font-display text-[24px] leading-none text-text">Заказ #{chat.order_id}</div>
            <div className="text-[12px] text-muted mt-1">{formatPrice(chat.total)} · чат с менеджером</div>
          </div>
          <span className={`text-[11px] font-medium uppercase tracking-[0.08em] px-2.5 py-1 border shrink-0 ${statusTone(status)}`}>{STATUS_LABEL[status] || status}</span>
        </div>
        <StatusTrack status={status} history={history} />
        {status !== 'done' && status !== 'cancelled' && <NotifyPrompt />}
        <div className="flex items-center gap-3">
          <button onClick={() => setShowItems((v) => !v)} className="flex items-center gap-1.5 text-[12px] text-muted hover:text-text cursor-pointer">
            <Package size={13} /> Состав заказа ({items.length}) <ChevronDown size={13} className={`transition-transform ${showItems ? 'rotate-180' : ''}`} />
          </button>
          {status === 'new' && (
            <button onClick={cancel} className="ml-auto text-[12px] text-muted hover:text-danger flex items-center gap-1 cursor-pointer"><X size={13} /> Отменить заказ</button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {showItems && (
            <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <ItemsList items={items} />
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3" style={{ overscrollBehavior: 'contain' }}>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
        ) : messages.map((m) => <Bubble key={m.id} msg={m} />)}
      </div>

      {closed ? (
        <div className="shrink-0 px-4 py-3.5 border-t border-ink/[0.07] text-center text-[12px] text-muted flex items-center justify-center gap-1.5">
          {status === 'done' ? <Check size={14} className="text-success" /> : <X size={14} className="text-danger" />}
          Заказ {STATUS_LABEL[status].toLowerCase()} — чат закрыт
        </div>
      ) : (
        <div className="shrink-0 px-3.5 py-3 border-t border-ink/[0.07]">
          {images.length > 0 && <div className="mb-2"><ImageUploader value={images} onChange={setImages} userId={userId} prefix="orderchat" max={4} compact video /></div>}
          <div className="flex items-center gap-2">
            {images.length === 0 && <ImageUploader value={images} onChange={setImages} userId={userId} prefix="orderchat" max={4} compact video />}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Написать менеджеру…"
              className="field !py-2.5"
            />
            <button onClick={send} disabled={(!text.trim() && !images.length) || sending} className="btn-primary w-11 h-11 !p-0 shrink-0" aria-label="Отправить">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ItemsList({ items }: { items: OrderItem[] }) {
  return (
    <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-muted truncate">{it.name} × {it.qty}{it.variant_comment ? ` · ${it.variant_comment}` : ''}</span>
          <span className="whitespace-nowrap">
            {!!it.base_price && it.base_price > it.price && <span className="text-light line-through mr-1.5">{formatPrice(it.base_price * it.qty)}</span>}
            <span className="text-text font-semibold">{formatPrice(it.price * it.qty)}</span>
          </span>
        </div>
      ))}
      {items.some((it) => it.base_price && it.base_price > it.price) && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-primary-light pt-1"><BadgePercent size={12} /> Цены по промокоду</div>
      )}
    </div>
  );
}

export function Bubble({ msg, mineType = 'user' }: { msg: OrderChatMessage; mineType?: 'user' | 'leader' }) {
  const mine = msg.sender_type === mineType;
  const who = msg.sender_type === 'admin' ? (msg.sender_name === 'RefSale' ? 'RefSale' : 'Менеджер')
    : msg.sender_type === 'leader' ? `${msg.sender_name || 'Лидер мнений'} · лидер мнений`
    : msg.sender_name || 'Покупатель';
  // RefSale's own notes (order received, status changed) are instructions:
  // they stand out, in bold, so the buyer knows what happens next.
  const system = msg.sender_type === 'admin' && msg.sender_name === 'RefSale';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] px-3.5 py-2.5 rounded-[16px] text-[13.5px] leading-relaxed ${
        system ? 'bg-accent-strong border-2 border-ink text-ink font-semibold rounded-bl-[6px]'
          : mine ? 'bg-ink/[0.06] border border-line text-text rounded-br-[6px]'
          : 'bg-ink/[0.05] border border-ink/[0.08] text-text rounded-bl-[6px]'
      }`}>
        {!mine && <div className={`text-[10.5px] font-bold mb-0.5 ${system ? 'text-ink' : 'text-primary'}`}>{who}</div>}
        <div className="whitespace-pre-line break-words">{unescapeHtml(msg.text)}</div>
        <AttachedImages images={msg.images} size="sm" className="mt-1.5" />
        <div className={`text-[9.5px] mt-1 text-right ${system ? 'text-ink/60' : 'text-light'}`}>
          {new Date(msg.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

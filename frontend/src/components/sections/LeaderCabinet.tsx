import { useCallback, useEffect, useMemo, useState } from 'react';
import Meerkat from '../mascot/Meerkat';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Crown, Eye, Loader2, Send, X, Link2, MessageCircle, Package, Wallet, Clock, CheckCircle2, TrendingUp, LogIn } from 'lucide-react';
import { useAuthStore, useNotificationStore } from '../../store';
import {
  fetchLeaderOverview, fetchLeaderOrders, fetchLeaderOrderMessages, sendLeaderOrderMessage, setLeaderOrderStatus,
  fetchLeaderTickets, fetchLeaderTicketMessages, sendLeaderTicketMessage,
} from '../../api/client';
import type { LeaderOverview, LeaderOrder, LeaderTicket } from '../../api/client';
import type { OrderChatMessage } from '../../types';
import { formatPrice, formatDate, unescapeHtml } from '../../utils/format';
import { Bubble, ItemsList, parseItems, STATUS_LABEL, StatusTrack, statusTone } from './OrdersPage';
import useScrollLock from '../../hooks/useScrollLock';

/**
 * Opinion leader's cabinet. Everything here is read-only unless the admin
 * switched on "может писать" for this leader: they see every order placed
 * with their codes, the conversation between the shop and their audience,
 * and the reward accrued for delivered orders.
 */
export default function LeaderCabinet() {
  const { user, openAuth } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const [overview, setOverview] = useState<LeaderOverview | null>(null);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<LeaderOrder[]>([]);
  const [tickets, setTickets] = useState<LeaderTicket[]>([]);
  const [tab, setTab] = useState<'orders' | 'tickets'>('orders');
  const [filter, setFilter] = useState<string>('all');
  const [openOrder, setOpenOrder] = useState<LeaderOrder | null>(null);
  const [openTicket, setOpenTicket] = useState<LeaderTicket | null>(null);

  const load = useCallback(async () => {
    const res = await fetchLeaderOverview();
    if (res.error) { setError(res.error); return; }
    setOverview(res.data || null);
    const [o, t] = await Promise.all([fetchLeaderOrders(), fetchLeaderTickets()]);
    setOrders(o);
    setTickets(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user, load]);

  const shown = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') return orders.filter((o) => ['accepted', 'processing', 'shipping'].includes(o.status));
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-[170px] max-lg:pt-[120px] pb-24 text-center">
        <Crown size={34} className="mx-auto text-primary mb-4" />
        <h1 className="font-display text-[38px] leading-none text-text mb-3">Кабинет лидера мнений</h1>
        <p className="text-sm text-muted mb-7">Войдите в аккаунт, к которому администратор привязал ваши промокоды.</p>
        <button onClick={() => openAuth('login')} className="btn-primary px-8 h-12 text-[15px]"><LogIn size={17} /> Войти</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-[170px] max-lg:pt-[120px] pb-24 text-center">
        <Crown size={34} className="mx-auto text-primary/60 mb-4" />
        <h1 className="font-display text-[34px] leading-none text-text mb-3">Кабинет недоступен</h1>
        <p className="text-sm text-muted">{error}. Если вы договорились о сотрудничестве — напишите администратору, он откроет доступ.</p>
      </div>
    );
  }

  if (!overview) {
    return <div className="pt-40 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const s = overview.stats;
  const origin = window.location.origin;
  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(() => show(`${what} скопирован${what === 'Ссылка' ? 'а' : ''}`)).catch(() => show(text));
  };

  return (
    <div className="max-w-[1240px] mx-auto px-5 pt-[150px] max-lg:pt-[104px] pb-16">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
        <div className="flex items-end gap-4">
          <Meerkat pose="laptop" width={96} decorative className="max-sm:w-[70px]" />
          <div>
            <div className="label mb-2 flex items-center gap-2"><Crown size={13} /> Кабинет лидера мнений</div>
            <h1 className="font-display text-[44px] leading-none text-text max-sm:text-[34px]">{overview.leader.name}</h1>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 px-4 py-2 text-[12px] border ${overview.leader.can_write ? 'border-primary/40 text-primary-light bg-primary/10' : 'border-ink/10 text-muted bg-ink/[0.04]'}`}>
          {overview.leader.can_write ? <><MessageCircle size={14} /> Можно писать покупателям и вести заказы</> : <><Eye size={14} /> Режим просмотра</>}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:gap-3">
        <Stat icon={<Wallet size={18} />} label="Начислено" value={formatPrice(s.reward_earned)} hint="за выданные заказы" accent />
        <Stat icon={<Clock size={18} />} label="Ожидается" value={formatPrice(s.reward_pending)} hint="по заказам в работе" />
        <Stat icon={<CheckCircle2 size={18} />} label="Выдано заказов" value={String(s.done)} hint={`из ${s.total} оформленных`} />
        <Stat icon={<TrendingUp size={18} />} label="Оборот" value={formatPrice(s.revenue_done)} hint="по выданным заказам" />
      </div>

      {/* Promo codes */}
      <div className="mt-8">
        <h2 className="font-display text-[28px] text-text mb-4">Ваши промокоды</h2>
        {overview.promos.length === 0 ? (
          <div className="bg-card border border-line p-6 text-sm text-muted">Промокоды ещё не выданы — администратор создаст их и привяжет к вашему аккаунту.</div>
        ) : (
          <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {overview.promos.map((p) => (
              <div key={p.code} className="bg-card border border-line p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-display text-[30px] leading-none tracking-[0.08em] text-text">{p.code}</div>
                  <span className={`text-[10px] font-medium uppercase tracking-[0.08em] px-2 py-1 border ${p.is_active ? 'text-success border-success/30 bg-success/10' : 'text-muted border-ink/10'}`}>
                    {p.is_active ? 'Активен' : 'Выключен'}
                  </span>
                </div>
                {p.label && <div className="text-[12px] text-muted mt-2">{p.label}</div>}
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <Mini label="Заказов" value={String(p.orders)} />
                  <Mini label="Выдано" value={String(p.done)} />
                  <Mini label="За заказ" value={formatPrice(p.reward_amount)} />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => copy(p.code, 'Промокод')} className="btn-outline flex-1 h-9 text-[12px]"><Copy size={13} /> Код</button>
                  <button onClick={() => copy(`${origin}/?promo=${encodeURIComponent(p.code)}`, 'Ссылка')} className="btn-primary flex-1 h-9 text-[12px]"><Link2 size={13} /> Ссылка</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders and questions */}
      <div className="mt-10">
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <TabBtn active={tab === 'orders'} onClick={() => setTab('orders')}><Package size={15} /> Заказы ({orders.length})</TabBtn>
          <TabBtn active={tab === 'tickets'} onClick={() => setTab('tickets')}><MessageCircle size={15} /> Вопросы покупателей ({tickets.length})</TabBtn>
          {tab === 'orders' && (
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="field !w-auto !py-2 ml-auto text-[13px]" aria-label="Фильтр по статусу">
              <option value="all">Все статусы</option>
              <option value="new">Ожидают подтверждения</option>
              <option value="active">В работе</option>
              <option value="done">Выданы</option>
              <option value="cancelled">Отменены</option>
            </select>
          )}
        </div>

        {tab === 'orders' ? (
          shown.length === 0 ? (
            <div className="bg-card border border-line p-10 text-center text-sm text-muted">Заказов по вашим промокодам пока нет.</div>
          ) : (
            <div className="bg-card border border-line overflow-hidden">
              <div className="grid grid-cols-[80px_1.2fr_1fr_1fr_1fr_1.2fr] gap-3 px-5 py-3 text-[11px] uppercase tracking-[0.15em] text-light border-b border-ink/[0.06] max-md:hidden">
                <span>Заказ</span><span>Покупатель</span><span>Дата</span><span>Сумма</span><span>Ваше вознагр.</span><span>Статус</span>
              </div>
              {shown.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setOpenOrder(o)}
                  className="w-full grid grid-cols-[80px_1.2fr_1fr_1fr_1fr_1.2fr] max-md:grid-cols-2 gap-3 px-5 py-4 text-left text-[13px] border-b border-ink/[0.04] last:border-b-0 hover:bg-ink/[0.03] cursor-pointer transition-colors items-center"
                >
                  <span className="font-semibold text-text">#{o.id}</span>
                  <span className="text-text truncate">{o.buyer}</span>
                  <span className="text-muted">{formatDate(o.created_at)}</span>
                  <span className="text-text">{formatPrice(o.total)}</span>
                  <span className={o.status === 'done' ? 'text-primary-light font-semibold' : o.status === 'cancelled' ? 'text-light line-through' : 'text-muted'}>{formatPrice(o.leader_reward)}</span>
                  <span><span className={`text-[11px] font-medium uppercase tracking-[0.08em] px-2.5 py-1 border ${statusTone(o.status)}`}>{STATUS_LABEL[o.status]}</span></span>
                </button>
              ))}
            </div>
          )
        ) : tickets.length === 0 ? (
          <div className="bg-card border border-line p-10 text-center text-sm text-muted">Вопросов от вашей аудитории пока нет.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => setOpenTicket(t)} className="bg-card border border-line p-4 text-left cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-text truncate">{unescapeHtml(t.subject)}</span>
                  <span className="text-[11px] text-light shrink-0">{formatDate(t.updated_at)}</span>
                </div>
                <div className="text-[12px] text-muted mt-1 truncate">{t.user_name}: {unescapeHtml(t.last_text) || '—'}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openOrder && <OrderDrawer order={openOrder} onClose={() => setOpenOrder(null)} onChanged={load} />}
      </AnimatePresence>
      <AnimatePresence>
        {openTicket && <TicketDrawer ticket={openTicket} onClose={() => setOpenTicket(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Stat({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`bg-card border border-line p-5 ${accent ? 'border-primary/30' : ''}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-muted"><span className="text-primary">{icon}</span>{label}</div>
      <div className={`font-display text-[34px] leading-none mt-3 max-sm:text-[26px] ${accent ? 'text-text' : 'text-text'}`}>{value}</div>
      <div className="text-[11.5px] text-light mt-2">{hint}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className=" bg-ink/[0.03] border border-ink/[0.06] py-2">
      <div className="text-[14px] font-semibold text-text">{value}</div>
      <div className="text-[10px] text-light uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 h-10 px-4 text-[12px] uppercase tracking-[0.1em] border transition-colors cursor-pointer ${active ? 'bg-primary/15 border-primary/45 text-primary-light' : 'border-ink/10 text-muted hover:text-text'}`}>
      {children}
    </button>
  );
}

function Drawer({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useScrollLock(true);
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2400] bg-ink/45 backdrop-blur-sm" onClick={onClose} />
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="fixed top-0 right-0 bottom-0 z-[2500] w-[520px] max-w-full bg-bg border border-line flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-ink/[0.07]">
          <div className="min-w-0">
            <div className="font-display text-[28px] leading-none text-text">{title}</div>
            {subtitle && <div className="text-[12px] text-muted mt-2">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-ink/5 border border-ink/10 flex items-center justify-center text-muted hover:text-text cursor-pointer shrink-0" aria-label="Закрыть"><X size={18} /></button>
        </div>
        {children}
        {footer}
      </motion.aside>
    </>
  );
}

function OrderDrawer({ order, onClose, onChanged }: { order: LeaderOrder; onClose: () => void; onChanged: () => void }) {
  const show = useNotificationStore((s) => s.show);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [status, setStatus] = useState(order.status as string);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchLeaderOrderMessages(order.id);
    setMessages(res.messages);
    if (res.status) setStatus(res.status);
    setCanWrite(res.can_write);
    setLoading(false);
  }, [order.id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const msg = await sendLeaderOrderMessage(order.id, text.trim());
      setMessages((m) => [...m, msg]);
      setText('');
    } catch (e) { show((e as Error).message, 'error'); }
    setSending(false);
  };

  const changeStatus = async (next: string) => {
    const res = await setLeaderOrderStatus(order.id, next);
    if (res.error) { show(res.error, 'error'); return; }
    setStatus(next);
    show(`Статус: ${STATUS_LABEL[next]}`);
    onChanged();
    void load();
  };

  const closed = status === 'done' || status === 'cancelled';
  return (
    <Drawer
      title={`Заказ #${order.id}`}
      subtitle={<>{order.buyer} · {formatDate(order.created_at)} · {formatPrice(order.total)}{order.promo_code ? ` · ${order.promo_code}` : ''}</>}
      onClose={onClose}
      footer={canWrite && !closed ? (
        <div className="px-4 py-3 border-t border-ink/[0.07]">
          <div className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} placeholder="Написать покупателю…" className="field !py-2.5" />
            <button onClick={send} disabled={!text.trim() || sending} className="btn-primary w-11 h-11 !p-0 shrink-0" aria-label="Отправить">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
          </div>
        </div>
      ) : (
        <div className="px-6 py-3.5 border-t border-ink/[0.07] text-[12px] text-muted flex items-center gap-2">
          <Eye size={14} className="text-primary" /> {closed ? 'Заказ закрыт' : 'Только просмотр — общается с покупателем менеджер'}
        </div>
      )}
    >
      <div className="px-6 py-4 border-b border-ink/[0.07] space-y-4">
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-medium uppercase tracking-[0.08em] px-2.5 py-1 border ${statusTone(status)}`}>{STATUS_LABEL[status]}</span>
          <span className="text-[12px] text-muted">Ваше вознаграждение: <b className="text-primary-light">{formatPrice(order.leader_reward)}</b>{status !== 'done' && status !== 'cancelled' ? ' (после выдачи)' : ''}</span>
        </div>
        <StatusTrack status={status} />
        {canWrite && !closed && (
          <select value={status} onChange={(e) => changeStatus(e.target.value)} className="field !py-2 text-[13px]" aria-label="Статус заказа">
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        <ItemsList items={parseItems(order.items)} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
          : messages.length === 0 ? <div className="text-center text-sm text-muted py-8">Сообщений пока нет</div>
          : messages.map((m) => <Bubble key={m.id} msg={m} mineType="leader" />)}
      </div>
    </Drawer>
  );
}

function TicketDrawer({ ticket, onClose }: { ticket: LeaderTicket; onClose: () => void }) {
  const show = useNotificationStore((s) => s.show);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    const res = await fetchLeaderTicketMessages(ticket.id);
    setMessages(res.messages.map((m) => ({ ...m, order_id: 0 })) as OrderChatMessage[]);
    setCanWrite(res.can_write);
    setLoading(false);
  }, [ticket.id]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      const msg = await sendLeaderTicketMessage(ticket.id, text.trim());
      setMessages((m) => [...m, { ...msg, order_id: 0 } as OrderChatMessage]);
      setText('');
    } catch (e) { show((e as Error).message, 'error'); }
  };

  return (
    <Drawer
      title={unescapeHtml(ticket.subject)}
      subtitle={<>{ticket.user_name}{ticket.promo_code ? ` · промокод ${ticket.promo_code}` : ''}</>}
      onClose={onClose}
      footer={canWrite && ticket.status !== 'closed' ? (
        <div className="px-4 py-3 border-t border-ink/[0.07] flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} placeholder="Ответить…" className="field !py-2.5" />
          <button onClick={send} disabled={!text.trim()} className="btn-primary w-11 h-11 !p-0 shrink-0" aria-label="Отправить"><Send size={16} /></button>
        </div>
      ) : (
        <div className="px-6 py-3.5 border-t border-ink/[0.07] text-[12px] text-muted flex items-center gap-2"><Eye size={14} className="text-primary" /> Только просмотр</div>
      )}
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
          : messages.map((m) => <Bubble key={m.id} msg={m} mineType="leader" />)}
      </div>
    </Drawer>
  );
}

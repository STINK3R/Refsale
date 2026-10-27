import { useCallback, useEffect, useMemo, useState } from 'react';
import Meerkat from '../mascot/Meerkat';
import { AnimatePresence, m } from 'framer-motion';
import { Copy, Crown, Eye, Loader2, Send, X, Link2, MessageCircle, Wallet, Clock, CheckCircle2, TrendingUp, LogIn } from 'lucide-react';
import { useAuthStore, useNotificationStore } from '../../store';
import {
  fetchLeaderOverview, fetchLeaderOrders, fetchLeaderOrderMessages, sendLeaderOrderMessage, setLeaderOrderStatus,
} from '../../api/client';
import type { LeaderOverview, LeaderOrder } from '../../api/client';
import type { OrderChatMessage } from '../../types';
import { formatPrice, formatDate } from '../../utils/format';
import { Bubble, ItemsList, parseItems, STATUS_LABEL, StatusTrack, statusStripe, statusTone } from './OrdersPage';
import useScrollLock from '../../hooks/useScrollLock';
import ImageUploader from '../ui/ImageUploader';

/**
 * Opinion leader's cabinet. Everything here is read-only unless the admin
 * switched on "может писать" for this leader: they see every order placed
 * with their codes, the conversation between the shop and their audience,
 * and the reward accrued for delivered orders. Questions to the platform go to
 * the admin alone, so they are not shown here.
 */
export default function LeaderCabinet() {
  const { user, openAuth } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const [overview, setOverview] = useState<LeaderOverview | null>(null);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<LeaderOrder[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [openOrder, setOpenOrder] = useState<LeaderOrder | null>(null);

  const load = useCallback(async () => {
    const res = await fetchLeaderOverview();
    if (res.error) { setError(res.error); return; }
    setOverview(res.data || null);
    setOrders(await fetchLeaderOrders());
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
      <div className="max-w-lg mx-auto px-5 pt-[calc(var(--header-h,104px)+56px)] pb-24 text-center">
        <Crown size={34} className="mx-auto text-primary mb-4" />
        <h1 className="font-display text-[38px] leading-none text-text mb-3">Кабинет лидера мнений</h1>
        <p className="text-sm text-muted mb-7">Войдите в аккаунт, к которому привязаны ваши промокоды.</p>
        <button onClick={() => openAuth('login')} className="btn-primary px-8 h-12 text-[15px]"><LogIn size={17} /> Войти</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-[calc(var(--header-h,104px)+56px)] pb-24 text-center">
        <Crown size={34} className="mx-auto text-primary/60 mb-4" />
        <h1 className="font-display text-[34px] leading-none text-text mb-3">Кабинет недоступен</h1>
        <p className="text-sm text-muted">{error}. Если вы договорились о сотрудничестве — напишите нам в чат, и мы откроем доступ.</p>
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

  const plate = 'bg-card border-2 border-ink rounded-[22px] max-sm:rounded-[18px] shadow-[0_4px_0_#111]';
  return (
    <div className="chat-bg min-h-screen">
    <div className="max-w-[1240px] mx-auto px-5 max-sm:px-3 pt-[calc(var(--header-h,104px)+28px)] pb-16">
      <div className="bg-accent border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_6px_0_#111] px-6 py-5 max-sm:px-4 max-sm:py-4 flex items-end justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-end gap-4 min-w-0">
          <Meerkat pose="laptop" width={96} decorative className="max-sm:w-[64px] -mb-1" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/70 mb-2 flex items-center gap-2"><Crown size={13} /> Кабинет лидера мнений</div>
            <h1 className="font-display text-[40px] leading-none text-ink max-sm:text-[28px] truncate">{overview.leader.name}</h1>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border-2 border-ink text-[12px] font-semibold ${overview.leader.can_write ? 'bg-[#DCEBFF] text-[#1B5BB0]' : 'bg-card text-ink'}`}>
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
        <h2 className="inline-block font-display text-[26px] text-ink mb-4 bg-card border-2 border-ink rounded-[14px] px-4 py-1.5">Ваши промокоды</h2>
        {overview.promos.length === 0 ? (
          <div className={`${plate} p-6 text-sm text-muted`}>Промокоды ещё не выданы — мы создадим их и привяжем к вашему аккаунту.</div>
        ) : (
          <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {overview.promos.map((p) => (
              <div key={p.code} className={`${plate} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-display text-[28px] leading-none tracking-[0.08em] text-ink">{p.code}</div>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border ${p.is_active ? 'text-[#13723A] bg-[#DDF5E5] border-[#9ED6B0]' : 'text-muted bg-surface border-ink/10'}`}>
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
                  <button onClick={() => copy(p.code, 'Промокод')} className="btn-outline flex-1 h-10 text-[12px]"><Copy size={13} /> Код</button>
                  <button onClick={() => copy(`${origin}/?promo=${encodeURIComponent(p.code)}`, 'Ссылка')} className="btn-primary flex-1 h-10 text-[12px]"><Link2 size={13} /> Ссылка</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="mt-10">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h2 className="font-display text-[26px] text-ink bg-card border-2 border-ink rounded-[14px] px-4 py-1.5">Заказы <span className="text-ink/50">{orders.length}</span></h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="field !w-auto !h-10 !py-0 ml-auto text-[13px]" aria-label="Фильтр по статусу">
            <option value="all">Все статусы</option>
            <option value="new">Ожидают подтверждения</option>
            <option value="active">В работе</option>
            <option value="done">Выданы</option>
            <option value="cancelled">Отменены</option>
          </select>
        </div>

        {shown.length === 0 ? (
          <div className={`${plate} p-10 text-center text-sm text-muted`}>Заказов по вашим промокодам пока нет.</div>
        ) : (
          <div className={`${plate} overflow-hidden`}>
            <div className="grid grid-cols-[80px_1.2fr_1fr_1fr_1fr_1.2fr] gap-3 pl-6 pr-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/60 bg-surface border-b-2 border-ink max-md:hidden">
              <span>Заказ</span><span>Покупатель</span><span>Дата</span><span>Сумма</span><span>Ваше вознагр.</span><span>Статус</span>
            </div>
            {shown.map((o) => (
              <button
                key={o.id}
                onClick={() => setOpenOrder(o)}
                className="relative w-full grid grid-cols-[80px_1.2fr_1fr_1fr_1fr_1.2fr] max-md:grid-cols-2 gap-3 pl-6 pr-5 py-4 text-left text-[13px] border-b border-ink/[0.08] last:border-b-0 hover:bg-surface/60 cursor-pointer transition-colors items-center"
              >
                <span className={`absolute left-0 inset-y-0 w-1.5 ${statusStripe(o.status)}`} aria-hidden="true" />
                <span className="font-bold text-ink">№{o.id}</span>
                <span className="text-ink truncate">{o.buyer}</span>
                <span className="text-muted">{formatDate(o.created_at)}</span>
                <span className="text-ink font-semibold tabular-nums">{formatPrice(o.total)}</span>
                <span className={o.status === 'done' ? 'text-[#13723A] font-bold' : o.status === 'cancelled' ? 'text-light line-through' : 'text-muted'}>{formatPrice(o.leader_reward)}</span>
                <span><span className={`text-[11px] font-bold uppercase tracking-[0.06em] px-2.5 py-1 border ${statusTone(o.status)}`}>{STATUS_LABEL[o.status]}</span></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openOrder && <OrderDrawer order={openOrder} onClose={() => setOpenOrder(null)} onChanged={load} />}
      </AnimatePresence>
    </div>
    </div>
  );
}

function Stat({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`border-2 border-ink rounded-[22px] max-sm:rounded-[18px] shadow-[0_4px_0_#111] p-5 max-sm:p-4 ${accent ? 'bg-sun' : 'bg-card'}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/70"><span className="text-ink">{icon}</span>{label}</div>
      <div className="font-display text-[32px] leading-none mt-3 max-sm:text-[24px] text-ink tabular-nums">{value}</div>
      <div className="text-[11.5px] text-ink/60 mt-2">{hint}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-ink/10 rounded-ctl-sm py-2">
      <div className="text-[14px] font-bold text-ink tabular-nums">{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function Drawer({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useScrollLock(true);
  return (
    <>
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2400] bg-ink/45 backdrop-blur-sm" onClick={onClose} />
      <m.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="fixed top-0 right-0 bottom-0 z-[2500] w-[520px] max-w-full bg-card border-l-2 border-ink flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-5 bg-accent border-b-2 border-ink">
          <div className="min-w-0">
            <div className="font-display text-[26px] leading-none text-ink">{title}</div>
            {subtitle && <div className="text-[12px] text-ink/70 mt-2">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-ctl-sm bg-card border-2 border-ink flex items-center justify-center text-ink hover:bg-sun transition-colors cursor-pointer shrink-0" aria-label="Закрыть"><X size={18} strokeWidth={2.2} /></button>
        </div>
        {children}
        {footer}
      </m.aside>
    </>
  );
}

function OrderDrawer({ order, onClose, onChanged }: { order: LeaderOrder; onClose: () => void; onChanged: () => void }) {
  const show = useNotificationStore((s) => s.show);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [status, setStatus] = useState(order.status as string);
  const [history, setHistory] = useState<Record<string, string>>({});
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchLeaderOrderMessages(order.id);
    setMessages(res.messages);
    if (res.status) setStatus(res.status);
    if (res.history) setHistory(res.history);
    setCanWrite(res.can_write);
    setLoading(false);
  }, [order.id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  const [images, setImages] = useState<string[]>([]);
  const send = async () => {
    if ((!text.trim() && !images.length) || sending) return;
    setSending(true);
    try {
      const msg = await sendLeaderOrderMessage(order.id, text.trim(), images);
      setMessages((m) => [...m, msg]);
      setText('');
      setImages([]);
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
      title={`Заказ №${order.id}`}
      subtitle={<>{order.buyer} · {formatDate(order.created_at)} · {formatPrice(order.total)}{order.promo_code ? ` · ${order.promo_code}` : ''}</>}
      onClose={onClose}
      footer={canWrite && !closed ? (
        <LeaderComposer
          text={text} setText={setText} images={images} setImages={setImages}
          onSend={send} sending={sending} placeholder="Написать покупателю…" prefix="leader_order"
        />
      ) : (
        <div className="px-6 py-3.5 border-t border-ink/[0.07] text-[12px] text-muted flex items-center gap-2">
          <Eye size={14} className="text-primary" /> {closed ? 'Заказ закрыт' : 'Только просмотр — общается с покупателем менеджер'}
        </div>
      )}
    >
      <div className="px-6 py-4 border-b border-ink/[0.07] space-y-4">
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-bold uppercase tracking-[0.06em] px-2.5 py-1 border ${statusTone(status)}`}>{STATUS_LABEL[status]}</span>
          <span className="ml-auto text-right leading-tight">
            <span className="block text-[11px] text-muted">Ваше вознаграждение{status !== 'done' && status !== 'cancelled' ? ' · после выдачи' : ''}</span>
            <b className="block font-display text-[24px] text-primary-dark tabular-nums">{formatPrice(order.leader_reward)}</b>
          </span>
        </div>
        <StatusTrack status={status} history={history} />
        {canWrite && !closed && (
          <select value={status} onChange={(e) => changeStatus(e.target.value)} className="field !py-2 text-[13px]" aria-label="Статус заказа">
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        <ItemsList items={parseItems(order.items)} />
      </div>
      <div className="chat-bg flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-ink" /></div>
          : messages.length === 0 ? <div className="mx-auto w-fit text-center text-sm text-muted py-2 px-4 bg-card/90 rounded-full mt-6">Сообщений пока нет</div>
          : messages.map((m) => <Bubble key={m.id} msg={m} mineType="leader" />)}
      </div>
    </Drawer>
  );
}

/** The leader's message box: text plus photos or a short video. */
function LeaderComposer({ text, setText, images, setImages, onSend, sending, placeholder, prefix }: {
  text: string; setText: (v: string) => void; images: string[]; setImages: (v: string[]) => void;
  onSend: () => void; sending: boolean; placeholder: string; prefix: string;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  return (
    <div className="px-4 py-3 border-t border-ink/[0.07]">
      {images.length > 0 && userId && (
        <div className="mb-2"><ImageUploader value={images} onChange={setImages} userId={userId} prefix={prefix} max={4} compact video /></div>
      )}
      <div className="flex items-center gap-2">
        {images.length === 0 && userId && (
          <ImageUploader value={images} onChange={setImages} userId={userId} prefix={prefix} max={4} compact video />
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSend(); } }} placeholder={placeholder} className="field !py-2.5" />
        <button onClick={onSend} disabled={(!text.trim() && !images.length) || sending} className="btn-primary w-11 h-11 !p-0 shrink-0" aria-label="Отправить">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

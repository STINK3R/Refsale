/* eslint-disable react-hooks/set-state-in-effect -- These effects start async API reads; state changes follow awaited responses. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Check, LoaderCircle, Paperclip, Plus, RefreshCw, Save, Send, Trash2, X } from 'lucide-react';
import { adminRequest, adminUpload } from '../../api/adminClient';
import type { AdminNotice } from './AdminApp';
import { adminCard, adminDanger, adminInput, adminArea, adminPrimary, adminSecondary, AdminBadge, AdminEmpty, AdminTitle, dateLabel, priceLabel, useAdminTab, useEscape } from './AdminUi';
import type { OrderChatMessage, Category, Product, OrderItem } from '../../types';
import { Bubble, ItemsList, statusTone, parseItems } from '../sections/OrdersPage';

type AdminStoreProps = { notify: AdminNotice };
type StoreOrder = {
  id: number; full_name: string; phone?: string; user_email?: string; status: string; created_at: string;
  total: number; items: string | OrderItem[]; promo_code?: string; promo_codes?: string; leader_name?: string;
  last_text?: string; last_sender?: string; last_at?: string; needs_reply?: boolean; supplier_steps_pending?: number;
};
type Promo = { id: number; code: string; label?: string; leader_id?: number | null; leader_name?: string; reward_amount: number; is_active: boolean; scope?: string; scope_category_id?: number; scope_product_ids?: string; expires_at?: string; orders?: number; done?: number };
type Leader = { id: number; full_name: string; email?: string; phone?: string; is_leader: boolean; is_supplier?: boolean; leader_can_write?: boolean; promos?: number; orders?: number; done?: number };
const STORE_TABS = ['Заказы', 'Промокоды', 'Лидеры мнений', 'Цены', 'Настройки сайта'];
const ORDER_STATES = { new: 'Новый', accepted: 'Принят', processing: 'В обработке', shipping: 'В доставке', done: 'Выдан', cancelled: 'Отменён' };

export default function AdminStore({ notify }: AdminStoreProps) {
  const [tab] = useAdminTab(STORE_TABS.length);
  return <>
    {tab === 0 ? <OrdersPanel notify={notify} /> : tab === 1 ? <PromosPanel notify={notify} /> : tab === 2 ? <LeadersPanel notify={notify} /> : tab === 3 ? <PricesPanel notify={notify} /> : <SettingsPanel notify={notify} />}
  </>;
}

function OrdersPanel({ notify }: AdminStoreProps) {
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StoreOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setOrders(await adminRequest<StoreOrder[]>(`/api/admin/store/orders${filter ? `?status=${encodeURIComponent(filter)}` : ''}`)); }
    catch (e) { notify((e as Error).message, 'error'); }
    setLoading(false);
  }, [filter, notify]);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => {
    const q = query.toLocaleLowerCase('ru-RU').trim();
    return q ? orders.filter((o) => [o.id, o.full_name, o.phone, o.user_email, o.promo_code, o.promo_codes].some((v) => String(v || '').toLocaleLowerCase('ru-RU').includes(q))) : orders;
  }, [orders, query]);
  return <>
    <AdminTitle title="Заказы магазина" detail="Заказ и вся переписка с покупателем собраны в одном месте." action={<button onClick={() => void load()} className={adminSecondary}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Обновить</button>} />
    <div className="flex gap-2 flex-wrap mb-4">
      <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${adminInput} !w-auto`} aria-label="Статус заказа"><option value="">Все статусы</option>{Object.entries(ORDER_STATES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      <input value={query} onChange={(e) => setQuery(e.target.value)} className={`${adminInput} max-w-[420px]`} placeholder="Имя, телефон, почта, промокод или номер" />
    </div>
    {shown.length === 0 ? <AdminEmpty>{loading ? 'Загружаем заказы…' : 'Заказы не найдены'}</AdminEmpty> : <div className={`${adminCard} overflow-hidden`}>
      <div className="grid grid-cols-[76px_1.2fr_1fr_1fr_1.3fr_110px] gap-3 px-5 py-3 bg-surface text-[10px] uppercase tracking-[.12em] font-bold text-muted max-lg:hidden"><span>№</span><span>Покупатель</span><span>Дата</span><span>Сумма</span><span>Последнее сообщение</span><span>Статус</span></div>
      {shown.map((o) => <button key={o.id} onClick={() => setSelected(o)} className="relative w-full grid grid-cols-[76px_1.2fr_1fr_1fr_1.3fr_110px] max-lg:grid-cols-2 gap-3 px-5 py-4 text-left border-t border-ink/10 hover:bg-surface/60 cursor-pointer items-center">
        <span className="font-display text-[18px]">№{o.id}{o.needs_reply && <i className="inline-block ml-2 w-2.5 h-2.5 rounded-full bg-danger" title="Площадка должна ответить" />}</span>
        <span className="min-w-0"><b className="block truncate text-[13px]">{o.full_name || 'Покупатель'}</b><small className="text-muted">{o.phone || o.user_email || '—'}</small></span>
        <span className="text-[12px] text-muted">{dateLabel(o.created_at)}</span>
        <span className="font-bold tabular-nums">{priceLabel(o.total)}</span>
        <span className="text-[12px] text-muted truncate max-lg:col-span-2">{o.last_text || 'Откройте заказ, чтобы обсудить его'}</span>
        <span className={`w-fit border px-2.5 py-1 text-[10px] font-bold ${statusTone(o.status)}`}>{ORDER_STATES[o.status as keyof typeof ORDER_STATES] || o.status}</span>
      </button>)}
    </div>}
    {selected && <OrderChatDrawer order={selected} onClose={() => setSelected(null)} onChanged={load} notify={notify} />}
  </>;
}

function OrderChatDrawer({ order, onClose, onChanged, notify }: { order: StoreOrder; onClose: () => void; onChanged: () => void; notify: AdminNotice }) {
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [steps, setSteps] = useState<Array<Record<string, unknown>>>([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(order.status);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const [chat, suppliers] = await Promise.all([
        adminRequest<{ messages: OrderChatMessage[]; status: string }>(`/api/admin/orders/${order.id}/messages`),
        adminRequest<Array<Record<string, unknown>>>(`/api/admin/store/orders/${order.id}/supplier-steps`),
      ]);
      setMessages(chat.messages || []); setStatus(chat.status || order.status); setSteps(suppliers);
    } catch (e) { notify((e as Error).message, 'error'); }
    setLoading(false);
  }, [order.id, order.status, notify]);
  useEffect(() => { void load(); const timer = setInterval(load, 12000); return () => clearInterval(timer); }, [load]);
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const filesToUpload = Array.from(event.target.files || []).slice(0, Math.max(0, 4 - files.length));
    event.target.value = '';
    for (const file of filesToUpload) {
      try { const result = await adminUpload(file, 'order_chat'); setFiles((current) => current.length < 4 ? [...current, result.url] : current); }
      catch (e) { notify((e as Error).message, 'error'); }
    }
  };
  const send = async () => {
    if ((!text.trim() && !files.length) || busy) return;
    setBusy(true);
    try {
      await adminRequest(`/api/admin/orders/${order.id}/messages`, { method: 'POST', body: JSON.stringify({ sender_name: 'Менеджер', text: text.trim(), images: files }) });
      setText(''); setFiles([]); await load(); onChanged();
    } catch (e) { notify((e as Error).message, 'error'); }
    setBusy(false);
  };
  const changeStatus = async (next: string) => {
    try {
      await adminRequest(`/api/admin/store/orders/${order.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
      setStatus(next); notify(`Статус заказа №${order.id} обновлён`); await load(); onChanged();
    } catch (e) { notify((e as Error).message, 'error'); }
  };
  const confirm = async () => {
    try { await adminRequest(`/api/admin/store/orders/${order.id}/confirm`, { method: 'POST', body: '{}' }); setStatus('accepted'); notify('Оплата отмечена, заказ принят'); await load(); onChanged(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const deleteMessage = async (id: number) => {
    if (!window.confirm('Удалить сообщение из чата заказа?')) return;
    try { await adminRequest(`/api/admin/order-messages/${id}`, { method: 'DELETE' }); await load(); onChanged(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  useEscape(onClose);
  return <div className="fixed inset-0 z-[90] bg-ink/45 backdrop-blur-sm flex justify-end" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="w-[min(760px,100vw)] h-full bg-card border-l-2 border-ink flex flex-col shadow-[-8px_0_30px_rgba(0,0,0,.14)]">
      <header className="px-5 py-4 bg-sun border-b-2 border-ink flex items-start gap-3">
        <div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-[.14em] font-bold text-ink/60">Заказ магазина</div><h2 className="font-display text-[22px]">№{order.id} · {order.full_name || 'Покупатель'}</h2><p className="text-[11px] text-ink/65">{dateLabel(order.created_at)} · {priceLabel(order.total)} · {order.phone || order.user_email || 'контакты скрыты'}</p></div>
        <button onClick={onClose} className="w-10 h-10 rounded-ctl-sm border-2 border-ink bg-card grid place-items-center"><X size={18} /></button>
      </header>
      <div className="p-4 border-b border-ink/10 space-y-3">
        <ItemsList items={parseItems(typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []))} />
        {steps.length > 0 && <div className="flex flex-wrap gap-2">{steps.map((s) => <AdminBadge key={String(s.supplier_id)} tone={s.state === 'approved' ? 'green' : s.state === 'unavailable' ? 'red' : 'amber'}>{String(s.supplier_name)} · {s.state === 'approved' ? 'наличие подтверждено' : s.state === 'unavailable' ? 'нет в наличии' : 'ждём подтверждения'}{s.delivery_eta ? ` · ${dateLabel(String(s.delivery_eta))}` : ''}</AdminBadge>)}</div>}
        <div className="flex gap-2 flex-wrap">
          {status === 'new' && <button onClick={() => void confirm()} className={adminPrimary}><Check size={15} />Подтверждено — оплата получена</button>}
          <select value={status} onChange={(e) => void changeStatus(e.target.value)} className={`${adminInput} !w-auto`} aria-label="Изменить статус">{Object.entries(ORDER_STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </div>
      </div>
      <div className="chat-bg flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {loading ? <div className="py-8 grid place-items-center"><LoaderCircle className="animate-spin" /></div> : messages.length === 0 ? <div className="text-center text-[12px] text-muted mt-8">В этом заказе пока нет сообщений.</div> : messages.map((msg) => <div key={msg.id} className={`flex items-end gap-1.5 ${msg.sender_type === 'admin' ? 'flex-row-reverse' : ''}`}><div className="min-w-0"><Bubble msg={msg} mineType="admin" /></div><button type="button" onClick={() => void deleteMessage(msg.id)} className="text-danger/60 hover:text-danger shrink-0 p-1" aria-label="Удалить сообщение" title="Удалить сообщение"><Trash2 size={13} /></button></div>)}
      </div>
      <div className="p-3 border-t-2 border-ink/10 bg-card">
        {files.length > 0 && <div className="flex flex-wrap gap-2 mb-2">{files.map((url) => <span key={url} className="text-[11px] rounded-full bg-surface border border-ink/10 px-2.5 py-1">{url.split('/').pop()} <button onClick={() => setFiles((f) => f.filter((x) => x !== url))} aria-label="Убрать вложение"><X size={12} /></button></span>)}</div>}
        <div className="flex items-end gap-2">
          <label className={`${adminSecondary} !w-11 !h-11 !p-0 shrink-0 cursor-pointer`} title="Прикрепить фото или видео"><Paperclip size={18} /><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={upload} /></label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Ответить покупателю…" className={`${adminArea} resize-none`} />
          <button onClick={() => void send()} disabled={busy || (!text.trim() && !files.length)} className={`${adminPrimary} !w-11 !h-11 !p-0 shrink-0`} aria-label="Отправить"><Send size={16} /></button>
        </div>
      </div>
    </aside>
  </div>;
}

function PromosPanel({ notify }: AdminStoreProps) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [first, setFirst] = useState({ enabled: false, discount_amount: 500, validity_days: 14 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: '', label: '', leader_id: '', reward_amount: '0', scope: 'all', scope_category_id: '', scope_product_ids: [] as number[], expires_at: '' });
  const load = useCallback(async () => {
    try {
      const [p, d, f] = await Promise.all([
        adminRequest<{ promos: Promo[]; enabled: boolean }>('/api/admin/store/promos'),
        adminRequest<{ categories: Category[]; products: Product[] }>('/api/admin/data'),
        adminRequest<{ enabled: boolean; discount_amount: number; validity_days: number }>('/api/admin/store/first-purchase-promo'),
      ]);
      setPromos(p.promos || []); setEnabled(p.enabled !== false); setCategories(d.categories || []); setProducts(d.products || []); setFirst(f);
    } catch (e) { notify((e as Error).message, 'error'); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const togglePromos = async () => {
    const next = !enabled;
    try { await adminRequest('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ ref_promos_enabled: String(next) }) }); setEnabled(next); notify(next ? 'Промокоды включены' : 'Промокоды отключены'); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const saveFirst = async (e: FormEvent) => {
    e.preventDefault();
    try { const result = await adminRequest<typeof first>('/api/admin/store/first-purchase-promo', { method: 'PATCH', body: JSON.stringify(first) }); setFirst(result); notify('Промокод первой покупки сохранён'); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const createPromo = async (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { ...form, leader_id: form.leader_id || null, reward_amount: Number(form.reward_amount) || 0, scope_category_id: form.scope_category_id || null, expires_at: form.expires_at || null };
    if (form.scope === 'products') body.scope_product_ids = form.scope_product_ids;
    try { await adminRequest(editingId ? `/api/admin/store/promos/${editingId}` : '/api/admin/store/promos', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); setEditingId(null); setForm({ code: '', label: '', leader_id: '', reward_amount: '0', scope: 'all', scope_category_id: '', scope_product_ids: [], expires_at: '' }); notify(editingId ? 'Промокод обновлён' : 'Промокод создан'); await load(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const editPromo = (p: Promo) => {
    let ids: number[] = [];
    try { const raw = typeof p.scope_product_ids === 'string' ? JSON.parse(p.scope_product_ids || '[]') : p.scope_product_ids; ids = Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : []; } catch { ids = []; }
    setEditingId(p.id);
    setForm({ code: p.code, label: p.label || '', leader_id: String(p.leader_id || ''), reward_amount: String(p.reward_amount || 0), scope: p.scope || 'all', scope_category_id: String(p.scope_category_id || ''), scope_product_ids: ids, expires_at: p.expires_at ? new Date(p.expires_at).toISOString().slice(0, 16) : '' });
  };
  const togglePromo = async (promo: Promo) => {
    try { await adminRequest(`/api/admin/store/promos/${promo.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !promo.is_active }) }); await load(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const remove = async (promo: Promo) => {
    if (!window.confirm(`Удалить промокод ${promo.code}?`)) return;
    try { await adminRequest(`/api/admin/store/promos/${promo.id}`, { method: 'DELETE' }); notify('Промокод удалён'); await load(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  return <>
    <AdminTitle title="Промокоды и первая покупка" detail="Промокоды лидеров и приветственный подарок покупателю." action={<label className="flex items-center gap-2 rounded-full border-2 border-ink px-4 py-2 bg-card text-[12px] font-bold"><input type="checkbox" checked={enabled} onChange={() => void togglePromos()} className="w-4 h-4 accent-primary" />Промокоды активны</label>} />
    <form onSubmit={saveFirst} className={`${adminCard} p-5 mb-6 bg-sun/35`}>
      <div className="font-display text-[18px]">Подарок за первую покупку</div><p className="text-[12px] text-muted mt-1">Код выпускается автоматически и привязан к аккаунту покупателя.</p>
      <div className="grid grid-cols-[1fr_1fr_auto] max-sm:grid-cols-1 gap-3 mt-4 items-end">
        <label className="text-[11px] font-bold">Скидка, ₽<input type="number" min="1" value={first.discount_amount} onChange={(e) => setFirst({ ...first, discount_amount: Number(e.target.value) })} className={`${adminInput} mt-1`} /></label>
        <label className="text-[11px] font-bold">Срок действия, дней<input type="number" min="1" max="90" value={first.validity_days} onChange={(e) => setFirst({ ...first, validity_days: Number(e.target.value) })} className={`${adminInput} mt-1`} /></label>
        <div className="flex items-center gap-3"><label className="flex gap-2 text-[12px] font-bold items-center"><input type="checkbox" checked={first.enabled} onChange={(e) => setFirst({ ...first, enabled: e.target.checked })} className="w-4 h-4 accent-primary" />Включён</label><button className={adminPrimary}><Save size={15} />Сохранить</button></div>
      </div>
    </form>
    <div className="grid xl:grid-cols-[1fr_1.2fr] gap-5">
      <form onSubmit={createPromo} className={`${adminCard} p-5`}>
        <div className="flex items-center mb-4"><h2 className="font-display text-[17px] flex-1">{editingId ? 'Редактировать промокод' : 'Новый промокод лидера'}</h2>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm({ code: '', label: '', leader_id: '', reward_amount: '0', scope: 'all', scope_category_id: '', scope_product_ids: [], expires_at: '' }); }} className={adminSecondary}>Отмена</button>}</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-[11px] font-bold">Код<input required maxLength={50} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={`${adminInput} mt-1 uppercase`} /></label>
          <label className="text-[11px] font-bold">Вознаграждение, ₽<input type="number" min="0" step="0.01" value={form.reward_amount} onChange={(e) => setForm({ ...form, reward_amount: e.target.value })} className={`${adminInput} mt-1`} /></label>
          <label className="text-[11px] font-bold sm:col-span-2">Описание<input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={`${adminInput} mt-1`} placeholder="Например, скидка для подписчиков" /></label>
          <label className="text-[11px] font-bold">ID лидера<input type="number" min="1" value={form.leader_id} onChange={(e) => setForm({ ...form, leader_id: e.target.value })} className={`${adminInput} mt-1`} placeholder="Можно привязать позже" /></label>
          <label className="text-[11px] font-bold">Срок окончания<input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className={`${adminInput} mt-1`} /></label>
          <label className="text-[11px] font-bold">Охват<select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className={`${adminInput} mt-1`}><option value="all">Весь каталог</option><option value="category">Категория</option><option value="products">Выбранные товары</option></select></label>
          {form.scope === 'category' && <label className="text-[11px] font-bold">Категория<select value={form.scope_category_id} onChange={(e) => setForm({ ...form, scope_category_id: e.target.value })} className={`${adminInput} mt-1`}><option value="">Выберите</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          {form.scope === 'products' && <label className="text-[11px] font-bold sm:col-span-2">Товары<select multiple value={form.scope_product_ids.map(String)} onChange={(e) => setForm({ ...form, scope_product_ids: Array.from(e.target.selectedOptions).map((o) => Number(o.value)) })} className={`${adminInput} mt-1 !h-32`}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        </div>
        <button className={`${adminPrimary} mt-4`}>{editingId ? <Save size={15} /> : <Plus size={15} />}{editingId ? 'Сохранить промокод' : 'Создать промокод'}</button>
      </form>
      <div className={`${adminCard} overflow-hidden`}>
        <div className="px-5 py-4 border-b-2 border-ink bg-surface font-display text-[16px]">Действующие и архивные</div>
        {promos.length === 0 ? <div className="p-6"><AdminEmpty>Промокодов пока нет</AdminEmpty></div> : promos.map((p) => <div key={p.id} className="p-4 border-b border-ink/10 flex gap-3 items-center flex-wrap">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><b className="font-display tracking-wider">{p.code}</b><AdminBadge tone={p.is_active ? 'green' : 'default'}>{p.is_active ? 'Активен' : 'Выключен'}</AdminBadge></div><div className="text-[11px] text-muted mt-1">{p.label || p.leader_name || `Лидер #${p.leader_id || '—'}`} · {priceLabel(p.reward_amount)} · {p.scope === 'category' ? `категория #${p.scope_category_id}` : p.scope === 'products' ? 'выбранные товары' : 'весь каталог'} · заказов {p.orders || 0}, выдано {p.done || 0}{p.expires_at ? ` · до ${dateLabel(p.expires_at)}` : ''}</div></div>
          <button onClick={() => editPromo(p)} className={adminSecondary}>Изменить</button><button onClick={() => void togglePromo(p)} className={adminSecondary}>{p.is_active ? 'Выключить' : 'Включить'}</button><button onClick={() => void remove(p)} className={adminDanger} aria-label="Удалить промокод"><Trash2 size={14} /></button>
        </div>)}
      </div>
    </div>
  </>;
}

function LeadersPanel({ notify }: AdminStoreProps) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Leader[]>([]);
  const [searching, setSearching] = useState(false);
  const load = useCallback(async () => { try { setLeaders(await adminRequest<Leader[]>('/api/admin/store/leaders')); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try { setResults(await adminRequest<Leader[]>(`/api/admin/store/users?q=${encodeURIComponent(query.trim())}`)); }
    catch (e) { notify((e as Error).message, 'error'); }
    setSearching(false);
  };
  const flag = async (id: number, patch: Record<string, boolean>) => {
    try { await adminRequest(`/api/admin/store/users/${id}/leader`, { method: 'PATCH', body: JSON.stringify(patch) }); await load(); notify('Доступы обновлены'); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const users = useMemo(() => [...leaders, ...results.filter((u) => !leaders.some((l) => l.id === u.id))], [leaders, results]);
  return <>
    <AdminTitle title="Лидеры мнений и поставщики" detail="Включайте кабинеты и право отвечать в заказных чатах." />
    <div className={`${adminCard} p-4 flex gap-2 mb-4`}><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} className={adminInput} placeholder="Найти аккаунт по имени, почте или телефону" /><button onClick={() => void search()} className={adminPrimary} disabled={searching}>{searching ? <LoaderCircle className="animate-spin" size={15} /> : 'Найти'}</button></div>
    {users.length === 0 ? <AdminEmpty>Пока нет участников с кабинетами</AdminEmpty> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{users.map((u) => <div key={u.id} className={`${adminCard} p-4`}>
      <div className="font-bold">{u.full_name} <span className="text-[10px] font-normal text-muted">#{u.id}</span></div><div className="text-[11px] text-muted mt-1">{u.email || u.phone || 'Контакты не указаны'}</div>
      <div className="flex gap-2 flex-wrap mt-3"><label className="flex items-center gap-1.5 text-[11px] font-bold"><input type="checkbox" checked={!!u.is_leader} onChange={(e) => void flag(u.id, { is_leader: e.target.checked })} className="accent-primary" />Лидер</label><label className="flex items-center gap-1.5 text-[11px] font-bold"><input type="checkbox" checked={!!u.is_supplier} onChange={(e) => void flag(u.id, { is_supplier: e.target.checked })} className="accent-primary" />Поставщик</label>{u.is_leader && <label className="flex items-center gap-1.5 text-[11px] font-bold"><input type="checkbox" checked={!!u.leader_can_write} onChange={(e) => void flag(u.id, { leader_can_write: e.target.checked })} className="accent-primary" />Писать по заказам</label>}</div>
      {!!u.is_leader && <div className="mt-3 text-[10px] text-muted">Промокодов: {u.promos ?? '—'} · заказов: {u.orders ?? '—'} · выдано: {u.done ?? '—'}</div>}
    </div>)}</div>}
  </>;
}

function PricesPanel({ notify }: AdminStoreProps) {
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([]);
  const [draft, setDraft] = useState<Record<number, { price: string; promo_price: string; is_available: boolean }>>({});
  const load = useCallback(async () => {
    try {
      const rows = await adminRequest<Array<Record<string, unknown>>>('/api/admin/store/products'); setProducts(rows);
      setDraft(Object.fromEntries(rows.map((p) => [Number(p.id), { price: String(p.price ?? ''), promo_price: String(p.promo_price ?? ''), is_available: p.is_available !== false }])));
    } catch (e) { notify((e as Error).message, 'error'); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const save = async (id: number) => {
    const d = draft[id]; if (!d) return;
    try { await adminRequest(`/api/admin/store/products/${id}`, { method: 'PATCH', body: JSON.stringify({ price: d.price, promo_price: d.promo_price || null, is_available: d.is_available }) }); notify('Цены сохранены'); await load(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  return <>
    <AdminTitle title="Цены магазина" detail="Базовая цена и цена для держателей промокода." />
    {products.length === 0 ? <AdminEmpty>Товаров нет</AdminEmpty> : <div className={`${adminCard} overflow-hidden`}>
      <div className="grid grid-cols-[minmax(0,1.4fr)_130px_150px_100px_90px] gap-3 px-4 py-3 bg-surface text-[10px] font-bold uppercase tracking-[.1em] text-muted max-md:hidden"><span>Товар</span><span>Цена</span><span>По промокоду</span><span>В наличии</span><span /></div>
      {products.map((p) => { const id = Number(p.id); const d = draft[id] || { price: '', promo_price: '', is_available: true }; return <div key={id} className="grid grid-cols-[minmax(0,1.4fr)_130px_150px_100px_90px] max-md:grid-cols-2 gap-3 p-4 border-t border-ink/10 items-center">
        <div className="min-w-0"><div className="font-bold text-[13px] truncate">{String(p.name)}</div><div className="text-[10px] text-muted">{String(p.category_name || '')}</div></div>
        <input type="number" value={d.price} onChange={(e) => setDraft((v) => ({ ...v, [id]: { ...d, price: e.target.value } }))} className={`${adminInput} !h-9`} aria-label={`Цена ${String(p.name)}`} />
        <input type="number" value={d.promo_price} onChange={(e) => setDraft((v) => ({ ...v, [id]: { ...d, promo_price: e.target.value } }))} className={`${adminInput} !h-9`} aria-label={`Цена по промокоду ${String(p.name)}`} />
        <input type="checkbox" checked={d.is_available} onChange={(e) => setDraft((v) => ({ ...v, [id]: { ...d, is_available: e.target.checked } }))} className="w-5 h-5 accent-primary" aria-label="В наличии" />
        <button onClick={() => void save(id)} className={`${adminPrimary} !h-9 !px-3`}><Save size={14} />Сохранить</button>
      </div>; })}
    </div>}
  </>;
}

function SettingsPanel({ notify }: AdminStoreProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [faq, setFaq] = useState<Array<{ q: string; a: string }>>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const s = await adminRequest<Record<string, string>>('/api/settings'); setSettings(s); try { const parsed = JSON.parse(s.faq_json || '[]'); setFaq(Array.isArray(parsed) ? parsed : []); } catch { setFaq([]); } }
    catch (e) { notify((e as Error).message, 'error'); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const set = (key: string, value: string) => setSettings((s) => ({ ...s, [key]: value }));
  const save = async (body: Record<string, unknown>, label: string) => {
    setBusy(true);
    try { await adminRequest('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }); notify(label); }
    catch (e) { notify((e as Error).message, 'error'); }
    setBusy(false);
  };
  const changeFaq = (index: number, key: 'q' | 'a', value: string) => setFaq((items) => items.map((it, i) => i === index ? { ...it, [key]: value } : it));
  const moveFaq = (index: number, dir: -1 | 1) => setFaq((items) => { const next = [...items]; const to = index + dir; if (to < 0 || to >= next.length) return items; [next[index], next[to]] = [next[to], next[index]]; return next; });
  const legalKeys = ['legal_name', 'legal_inn', 'legal_ogrn', 'legal_address', 'legal_email', 'legal_phone', 'legal_hosting'];
  const aboutBranches = [['buyer', 'Покупателям'], ['leader', 'Лидерам мнений'], ['supplier', 'Поставщикам']];
  return <>
    <AdminTitle title="Настройки сайта" detail="Контакты, правовая информация, блок «О нас», FAQ, аналитика и индексация." />
    <div className="grid xl:grid-cols-2 gap-5">
      <form onSubmit={(e) => { e.preventDefault(); const body: Record<string, string> = {}; [1, 2].forEach((n) => ['label', 'phone', 'email', 'tg', 'wa', 'max'].forEach((k) => { body[`contact_${k}_${n}`] = settings[`contact_${k}_${n}`] || ''; })); void save(body, 'Контакты сохранены'); }} className={`${adminCard} p-5`}>
        <h2 className="font-display text-[18px] mb-4">Контакты</h2>
        {[1, 2].map((n) => <div key={n} className="rounded-ctl-md bg-surface/60 p-4 mb-3"><b className="text-[12px]">{n === 1 ? 'Рабочие контакты' : 'Администрация'}</b><div className="grid sm:grid-cols-2 gap-3 mt-3">{[['label','Подпись'],['phone','Телефон'],['email','Почта'],['tg','Telegram'],['wa','WhatsApp'],['max','MAX']].map(([key, label]) => <label key={key} className="text-[10px] font-bold">{label}<input value={settings[`contact_${key}_${n}`] || ''} onChange={(e) => set(`contact_${key}_${n}`, e.target.value)} className={`${adminInput} mt-1 !h-9`} /></label>)}</div></div>)}<button disabled={busy} className={adminPrimary}><Save size={14} />Сохранить контакты</button>
      </form>
      <div className={`${adminCard} p-5`}>
        <h2 className="font-display text-[18px] mb-4">Правовые реквизиты</h2><div className="grid sm:grid-cols-2 gap-3">{legalKeys.map((key) => <label key={key} className="text-[10px] font-bold">{{ legal_name:'Название оператора', legal_inn:'ИНН', legal_ogrn:'ОГРН', legal_address:'Адрес', legal_email:'Почта', legal_phone:'Телефон', legal_hosting:'Хостинг' }[key]}<input value={settings[key] || ''} onChange={(e) => set(key, e.target.value)} className={`${adminInput} mt-1`} /></label>)}</div><button onClick={() => void save(Object.fromEntries(legalKeys.map((k) => [k, settings[k] || ''])), 'Правовые реквизиты сохранены')} disabled={busy} className={`${adminPrimary} mt-4`}><Save size={14} />Сохранить реквизиты</button>
      </div>
      <div className={`${adminCard} p-5 xl:col-span-2`}>
        <h2 className="font-display text-[18px] mb-4">О нас: отдельные описания</h2><div className="grid lg:grid-cols-3 gap-4">{aboutBranches.map(([key, label]) => <div key={key} className="bg-surface/60 rounded-ctl-md p-4"><b className="text-[12px]">{label}</b>{key !== 'buyer' && <label className="block text-[10px] font-bold mt-3">Краткое описание на общей странице<textarea rows={3} value={settings[`about_${key}_short`] || ''} onChange={(e) => set(`about_${key}_short`, e.target.value)} className={`${adminArea} mt-1`} /></label>}<label className="block text-[10px] font-bold mt-3">Заголовок<input value={settings[`about_${key}_title`] || ''} onChange={(e) => set(`about_${key}_title`, e.target.value)} className={`${adminInput} mt-1`} /></label><label className="block text-[10px] font-bold mt-3">Текст<textarea rows={5} value={settings[`about_${key}_text`] || ''} onChange={(e) => set(`about_${key}_text`, e.target.value)} className={`${adminArea} mt-1`} /></label></div>)}</div><button onClick={() => { const keys = aboutBranches.flatMap(([key]) => [`about_${key}_title`, `about_${key}_text`, `about_${key}_short`]); void save(Object.fromEntries(keys.map((k) => [k, settings[k] || ''])), 'Тексты «О нас» сохранены'); }} disabled={busy} className={`${adminPrimary} mt-4`}><Save size={14} />Сохранить тексты</button>
      </div>
      <div className={`${adminCard} p-5 xl:col-span-2`}>
        <div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-display text-[18px]">FAQ</h2><button onClick={() => setFaq((items) => [...items, { q: '', a: '' }])} className={adminSecondary}><Plus size={14} />Добавить вопрос</button></div>
        <div className="space-y-3">{faq.map((item, i) => <div key={i} className="bg-surface/55 rounded-ctl-md p-4"><div className="grid md:grid-cols-2 gap-3"><label className="text-[10px] font-bold">Вопрос<input value={item.q} onChange={(e) => changeFaq(i, 'q', e.target.value)} className={`${adminInput} mt-1`} /></label><label className="text-[10px] font-bold">Ответ<textarea rows={3} value={item.a} onChange={(e) => changeFaq(i, 'a', e.target.value)} className={`${adminArea} mt-1`} /></label></div><div className="flex gap-2 mt-3"><button disabled={i === 0} onClick={() => moveFaq(i, -1)} className={adminSecondary}>↑ Вверх</button><button disabled={i === faq.length - 1} onClick={() => moveFaq(i, 1)} className={adminSecondary}>↓ Вниз</button><button onClick={() => setFaq((items) => items.filter((_, n) => n !== i))} className={adminDanger}><Trash2 size={14} />Удалить</button></div></div>)}</div>
        <button onClick={() => void save({ faq_json: JSON.stringify(faq.filter((x) => x.q.trim() && x.a.trim())) }, 'FAQ сохранён')} disabled={busy} className={`${adminPrimary} mt-4`}><Save size={14} />Сохранить FAQ</button>
      </div>
      <div className={`${adminCard} p-5 xl:col-span-2`}>
        <h2 className="font-display text-[18px] mb-4">Поиск и аналитика</h2><div className="grid md:grid-cols-3 gap-3"><label className="text-[10px] font-bold">ID Яндекс.Метрики<input inputMode="numeric" value={settings.metrika_id || ''} onChange={(e) => set('metrika_id', e.target.value.replace(/\D/g, '').slice(0, 12))} className={`${adminInput} mt-1`} /></label><label className="text-[10px] font-bold">Подтверждение Яндекса<input value={settings.yandex_verification || ''} onChange={(e) => set('yandex_verification', e.target.value)} className={`${adminInput} mt-1`} /></label><label className="text-[10px] font-bold">Подтверждение Google<input value={settings.google_verification || ''} onChange={(e) => set('google_verification', e.target.value)} className={`${adminInput} mt-1`} /></label></div><div className="flex gap-3 items-center flex-wrap mt-3"><label className="flex gap-2 items-center text-[11px] font-bold"><input type="checkbox" checked={settings.metrika_webvisor === 'true'} onChange={(e) => set('metrika_webvisor', String(e.target.checked))} className="accent-primary" />Вебвизор</label><button onClick={() => void save({ metrika_id: settings.metrika_id || '', metrika_webvisor: settings.metrika_webvisor || 'false', yandex_verification: settings.yandex_verification || '', google_verification: settings.google_verification || '' }, 'Настройки аналитики сохранены')} disabled={busy} className={adminPrimary}><Save size={14} />Сохранить</button><button onClick={async () => { try { const r = await adminRequest<{ ok: boolean; count?: number; error?: string }>('/api/admin/seo/indexnow', { method: 'POST', body: '{}' }); notify(r.ok ? `Яндекс принял ${r.count || 0} страниц` : (r.error || 'Не удалось отправить'), r.ok ? 'success' : 'error'); } catch (e) { notify((e as Error).message, 'error'); } }} className={adminSecondary}>Отправить URL в Яндекс</button></div>
      </div>
    </div>
  </>;
}

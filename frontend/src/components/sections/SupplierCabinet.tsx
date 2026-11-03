import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  Truck, LogIn, Loader2, Plus, Pencil, Trash2, Eye, EyeOff, PackageCheck, Clock, ShoppingBag, TrendingUp,
  MessageCircle, AlertTriangle, CheckCircle2, ImageOff,
} from 'lucide-react';
import Meerkat from '../mascot/Meerkat';
import Avatar from '../ui/Avatar';
import ImageUploader from '../ui/ImageUploader';
import { useAppStore, useAuthStore, useNotificationStore } from '../../store';
import { useSupportStore } from '../../store/support';
import {
  fetchSupplierOverview, fetchSupplierProducts, saveSupplierProduct, deleteSupplierProduct,
  fetchSupplierOrders, fetchSupplierOrderMessages, sendSupplierOrderMessage,
} from '../../api/client';
import type { SupplierOverview, SupplierProduct, SupplierProductForm, SupplierOrder, Moderation } from '../../api/client';
import type { OrderChatMessage } from '../../types';
import { formatPrice, formatDate } from '../../utils/format';
import { Bubble, ItemsList, STATUS_LABEL, StatusTrack, statusStripe, statusTone } from './OrdersPage';
import { Drawer, LeaderComposer, Stat } from './LeaderCabinet';

const plate = 'bg-card border-2 border-ink rounded-[22px] max-sm:rounded-[18px] shadow-[0_4px_0_#111]';

const MODERATION: Record<Moderation, { label: string; tone: string }> = {
  pending: { label: 'На проверке', tone: 'text-[#8A5A00] bg-[#FFF1C7] border-[#F0CF72]' },
  approved: { label: 'На витрине', tone: 'text-[#13723A] bg-[#DDF5E5] border-[#9ED6B0]' },
  rejected: { label: 'Нужна доработка', tone: 'text-[#B3261E] bg-[#FDE3E1] border-[#F2A9A3]' },
};

/**
 * The supplier's cabinet. A supplier adds their own products — each one waits
 * for the platform's review before it shows in the catalog, and goes back to
 * review after an edit — and sees the orders that hold them, with the order
 * chat: they answer the buyer there themselves, as «Поставщик».
 */
export default function SupplierCabinet() {
  const { user, openAuth } = useAuthStore();
  const openSupport = useSupportStore((s) => s.open);
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState<SupplierOverview | null>(null);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [tab, setTab] = useState<'products' | 'orders'>(params.get('order') ? 'orders' : 'products');
  const [editing, setEditing] = useState<SupplierProduct | 'new' | null>(null);
  // A notification's link (/supplier?order=12) opens that order
  const [openId, setOpenId] = useState<number | null>(() => Number(params.get('order')) || null);
  const openOrder = orders.find((o) => o.id === openId) || null;
  const closeOrder = () => {
    setOpenId(null);
    if (params.get('order')) { params.delete('order'); setParams(params, { replace: true }); }
  };

  const load = useCallback(() => Promise.all([fetchSupplierOverview(), fetchSupplierProducts(), fetchSupplierOrders()])
    .then(([res, p, o]) => {
      if (res.error) { setError(res.error); return; }
      setOverview(res.data || null);
      setProducts(p);
      setOrders(o);
    }), []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user, load]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-[calc(var(--header-h,104px)+56px)] pb-24 text-center">
        <Truck size={34} className="mx-auto text-primary mb-4" />
        <h1 className="font-display text-[38px] leading-none text-text mb-3">Кабинет поставщика</h1>
        <p className="text-sm text-muted mb-7">Войдите в аккаунт, к которому площадка подключила кабинет.</p>
        <button onClick={() => openAuth('login')} className="btn-primary px-8 h-12 text-[15px]"><LogIn size={17} /> Войти</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-[calc(var(--header-h,104px)+56px)] pb-24 text-center">
        <Truck size={34} className="mx-auto text-primary/60 mb-4" />
        <h1 className="font-display text-[34px] leading-none text-text mb-3">Кабинет недоступен</h1>
        <p className="text-sm text-muted mb-7">{error}. Напишите нам — расскажем об условиях и откроем доступ.</p>
        <button onClick={() => openSupport({ startInNew: true, prefillSubject: 'Поставка товаров' })} className="btn-primary px-8 h-12 text-[15px]"><MessageCircle size={17} /> Написать площадке</button>
      </div>
    );
  }

  if (!overview) {
    return <div className="pt-40 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const p = overview.products;
  const o = overview.orders;
  return (
    <div className="chat-bg min-h-screen">
      <div className="max-w-[1240px] mx-auto px-5 max-sm:px-3 pt-[calc(var(--header-h,104px)+28px)] pb-16">
        <div className="bg-accent border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_6px_0_#111] px-6 py-5 max-sm:px-4 max-sm:py-4 flex items-end justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-end gap-4 min-w-0">
            {user.avatar_url
              ? <Avatar name={user.full_name} url={user.avatar_url} size={84} className="max-sm:!w-16 max-sm:!h-16" />
              : <Meerkat pose="laptop" width={96} decorative className="max-sm:w-[64px] -mb-1" />}
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/70 mb-2 flex items-center gap-2"><Truck size={13} /> Кабинет поставщика</div>
              <h1 className="font-display text-[40px] leading-none text-ink max-sm:text-[28px] line-clamp-2 break-words">{overview.supplier.name}</h1>
            </div>
          </div>
          <button onClick={() => { setTab('products'); setEditing('new'); }} className="btn-primary h-11 px-5 text-[14px] max-sm:w-full"><Plus size={17} strokeWidth={2.4} /> Добавить товар</button>
        </div>

        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:gap-3">
          <Stat icon={<PackageCheck size={18} />} label="На витрине" value={String(p.on_sale)} hint={`из ${p.total} товаров`} accent />
          <Stat icon={<Clock size={18} />} label="На проверке" value={String(p.pending)} hint={p.rejected ? `и ${p.rejected} на доработке` : 'смотрит площадка'} />
          <Stat icon={<ShoppingBag size={18} />} label="Заказы в работе" value={String(o.active)} hint={`выдано ${o.done} из ${o.total}`} />
          <Stat icon={<TrendingUp size={18} />} label="Оборот" value={formatPrice(o.revenue_done)} hint="ваши позиции в выданных заказах" />
        </div>

        <div className="mt-8 flex gap-2 flex-wrap" role="tablist" aria-label="Раздел кабинета">
          {([['products', `Товары ${products.length}`], ['orders', `Заказы ${orders.length}`]] as const).map(([id, label]) => (
            <button
              key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`h-11 px-5 rounded-[14px] border-2 border-ink font-display text-[20px] cursor-pointer transition-colors ${tab === id ? 'bg-ink text-sun' : 'bg-card text-ink hover:bg-sun'}`}
            >{label}</button>
          ))}
        </div>

        <div className="mt-5">
          {tab === 'products'
            ? <ProductsList products={products} onEdit={setEditing} onChanged={load} />
            : <OrdersList orders={orders} onOpen={(o) => setOpenId(o.id)} />}
        </div>

        <AnimatePresence>
          {editing && <ProductDrawer key="product" product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
          {openOrder && <OrderDrawer key="order" order={openOrder} onClose={closeOrder} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ProductsList({ products, onEdit, onChanged }: { products: SupplierProduct[]; onEdit: (p: SupplierProduct) => void; onChanged: () => void }) {
  const show = useNotificationStore((s) => s.show);
  const [busy, setBusy] = useState<number | null>(null);

  if (products.length === 0) {
    return (
      <div className={`${plate} p-10 text-center`}>
        <div className="font-display text-[26px] text-ink">Товаров пока нет</div>
        <p className="text-sm text-muted mt-2 max-w-[420px] mx-auto">Добавьте первый: фото, описание и цену. Площадка проверит его и поставит на витрину, а цену для держателей промокодов согласует с вами.</p>
      </div>
    );
  }

  const toggle = async (p: SupplierProduct) => {
    setBusy(p.id);
    const res = await saveSupplierProduct(p.id, { is_available: !p.is_available });
    setBusy(null);
    if (res.error) { show(res.error, 'error'); return; }
    show(p.is_available ? 'Товар скрыт из каталога' : 'Товар снова в наличии');
    onChanged();
  };
  const remove = async (p: SupplierProduct) => {
    if (!window.confirm(`Удалить «${p.name}»?`)) return;
    setBusy(p.id);
    const res = await deleteSupplierProduct(p.id);
    setBusy(null);
    if (res.error) { show(res.error, 'error'); return; }
    show('Товар удалён');
    onChanged();
  };

  return (
    <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
      {products.map((p) => {
        const mod = MODERATION[p.moderation] || MODERATION.approved;
        const img = p.images[0] || p.image_url;
        return (
          <div key={p.id} className={`${plate} overflow-hidden flex flex-col`}>
            <div className="relative aspect-[4/3] bg-surface border-b-2 border-ink grid place-items-center overflow-hidden">
              {img ? <img src={img} alt="" loading="lazy" className={`w-full h-full object-contain p-3 ${p.is_available ? '' : 'opacity-40 grayscale'}`} />
                : <ImageOff size={30} className="text-ink/25" />}
              <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border ${mod.tone}`}>{mod.label}</span>
              {!p.is_available && <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border text-muted bg-card border-ink/15">Скрыт</span>}
            </div>
            <div className="p-5 flex-1 flex flex-col">
              <div className="text-[11px] text-muted">{p.category_name || 'Без категории'}</div>
              <div className="font-bold text-[15px] text-ink leading-snug mt-1 line-clamp-2">{p.name}</div>
              <div className="flex items-baseline gap-2 mt-2 flex-wrap">
                <span className="font-display text-[24px] text-ink tabular-nums">{formatPrice(p.price)}</span>
                {p.promo_price != null && <span className="text-[12px] text-primary-dark font-semibold">по промокоду {formatPrice(p.promo_price)}</span>}
              </div>
              {p.moderation === 'rejected' && (
                <div className="mt-3 rounded-ctl-sm bg-[#FDE3E1] border border-[#F2A9A3] px-3 py-2 text-[12.5px] text-[#7A1D17] leading-snug flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{p.moderation_note || 'Площадка вернула товар на доработку — поправьте и сохраните ещё раз.'}</span>
                </div>
              )}
              {p.moderation === 'pending' && (
                <div className="mt-3 text-[12px] text-muted leading-snug">Площадка проверит товар и поставит его на витрину.</div>
              )}
              <div className="flex gap-2 mt-auto pt-4">
                <button onClick={() => onEdit(p)} className="btn-outline flex-1 h-10 text-[12px]"><Pencil size={13} /> Изменить</button>
                <button onClick={() => toggle(p)} disabled={busy === p.id} className="btn-outline h-10 w-10 !p-0" title={p.is_available ? 'Скрыть из каталога' : 'Вернуть в каталог'} aria-label={p.is_available ? 'Скрыть из каталога' : 'Вернуть в каталог'}>
                  {p.is_available ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button onClick={() => remove(p)} disabled={busy === p.id} className="btn-outline h-10 w-10 !p-0 hover:!text-danger" title="Удалить" aria-label="Удалить">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrdersList({ orders, onOpen }: { orders: SupplierOrder[]; onOpen: (o: SupplierOrder) => void }) {
  if (orders.length === 0) {
    return <div className={`${plate} p-10 text-center text-sm text-muted`}>Заказов с вашими товарами пока нет.</div>;
  }
  return (
    <div className={`${plate} overflow-hidden`}>
      <div className="grid grid-cols-[80px_1fr_1fr_1fr_1.6fr_1.1fr] gap-3 pl-6 pr-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/60 bg-surface border-b-2 border-ink max-md:hidden">
        <span>Заказ</span><span>Покупатель</span><span>Дата</span><span>Ваши позиции</span><span>Последнее сообщение</span><span>Статус</span>
      </div>
      {orders.map((o) => (
        <button
          key={o.id}
          onClick={() => onOpen(o)}
          className="relative w-full grid grid-cols-[80px_1fr_1fr_1fr_1.6fr_1.1fr] max-md:grid-cols-2 gap-3 pl-6 pr-5 py-4 text-left text-[13px] border-b border-ink/[0.08] last:border-b-0 hover:bg-surface/60 cursor-pointer transition-colors items-center"
        >
          <span className={`absolute left-0 inset-y-0 w-1.5 ${statusStripe(o.status)}`} aria-hidden="true" />
          <span className="font-bold text-ink">№{o.id}</span>
          <span className="text-ink truncate">{o.buyer}</span>
          <span className="text-muted">{formatDate(o.created_at)}</span>
          <span className="text-ink font-semibold tabular-nums">{formatPrice(o.total)}</span>
          <span className="text-muted truncate max-md:col-span-2">{o.last_text || '—'}</span>
          <span><span className={`text-[11px] font-bold uppercase tracking-[0.06em] px-2.5 py-1 border ${statusTone(o.status)}`}>{STATUS_LABEL[o.status]}</span></span>
        </button>
      ))}
    </div>
  );
}

const EMPTY: SupplierProductForm = {
  name: '', description: '', price: null, compare_price_1: null, compare_price_2: null,
  category_id: null, subcategory_id: null, is_available: true, images: [],
};

function ProductDrawer({ product, onClose, onSaved }: { product: SupplierProduct | null; onClose: () => void; onSaved: () => void }) {
  const show = useNotificationStore((s) => s.show);
  const userId = useAuthStore((s) => s.user?.id);
  const { categories, subcategories } = useAppStore();
  const [form, setForm] = useState<SupplierProductForm>(() => product ? {
    name: product.name, description: product.description || '', price: product.price,
    compare_price_1: product.compare_price_1, compare_price_2: product.compare_price_2,
    category_id: product.category_id, subcategory_id: product.subcategory_id,
    is_available: product.is_available, images: product.images.length ? product.images : (product.image_url ? [product.image_url] : []),
  } : EMPTY);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof SupplierProductForm>(k: K, v: SupplierProductForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  const cat = categories.find((c) => c.id === form.category_id);
  const subs = useMemo(() => subcategories.filter((s) => s.category_id === form.category_id), [subcategories, form.category_id]);
  const ready = form.name.trim() && form.category_id && form.price && form.price > 0;

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    const res = await saveSupplierProduct(product?.id ?? null, form);
    setSaving(false);
    if (res.error) { show(res.error, 'error'); return; }
    show(res.moderation === 'pending' ? 'Сохранено — товар ушёл на проверку' : 'Сохранено');
    onSaved();
  };

  return (
    <Drawer
      title={product ? 'Изменить товар' : 'Новый товар'}
      subtitle={product?.moderation === 'approved'
        ? 'После изменений товар снова пройдёт проверку и до неё не будет виден в каталоге'
        : 'Площадка проверит товар и поставит его на витрину'}
      onClose={onClose}
      footer={(
        <div className="px-6 py-4 border-t-2 border-ink flex gap-3">
          <button onClick={onClose} className="btn-outline h-12 px-5 max-sm:px-4 text-[14px]">Отмена</button>
          <button onClick={save} disabled={!ready || saving} className="btn-primary flex-1 min-w-0 h-12 text-[15px]">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={17} /> {product ? 'Сохранить' : <><span className="max-sm:hidden">Отправить на проверку</span><span className="sm:hidden">На проверку</span></>}</>}
          </button>
        </div>
      )}
    >
      <div className="flex-1 min-h-0 overflow-y-auto modal-scroll px-6 py-5 space-y-4">
        <Field label="Фото" hint="Первое фото — на карточке товара" group>
          {userId && <ImageUploader value={form.images} onChange={(v) => set('images', v)} userId={userId} prefix="supplier_product" max={8} />}
        </Field>
        <Field label="Название">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={255} className="field" placeholder="Например, Chanel Coco Mademoiselle, 50 мл" />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Field label="Категория">
            <select value={form.category_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : null, subcategory_id: null }))} className="field">
              <option value="">Выберите</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Бренд или тип">
            <select value={form.subcategory_id ?? ''} onChange={(e) => set('subcategory_id', e.target.value ? Number(e.target.value) : null)} disabled={!subs.length} className="field disabled:opacity-50">
              <option value="">{subs.length ? 'Не указан' : 'Нет в категории'}</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Цена, ₽" hint="Цену для держателей промокодов согласует площадка">
          <input value={form.price ?? ''} onChange={(e) => set('price', num(e.target.value))} inputMode="decimal" className="field" placeholder="0" />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Field label={cat?.compare_label_1 ? `В «${cat.compare_label_1}», ₽` : 'В другом магазине, ₽'}>
            <input value={form.compare_price_1 ?? ''} onChange={(e) => set('compare_price_1', num(e.target.value))} inputMode="decimal" className="field" placeholder="необязательно" />
          </Field>
          <Field label={cat?.compare_label_2 ? `В «${cat.compare_label_2}», ₽` : 'Ещё в одном магазине, ₽'}>
            <input value={form.compare_price_2 ?? ''} onChange={(e) => set('compare_price_2', num(e.target.value))} inputMode="decimal" className="field" placeholder="необязательно" />
          </Field>
        </div>
        <Field label="Описание">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={6} maxLength={4000} className="field resize-y" placeholder="Состав, объём, страна, чем хорош" />
        </Field>
        <button
          type="button" onClick={() => set('is_available', !form.is_available)}
          className={`w-full flex items-center justify-between gap-3 px-4 h-12 rounded-ctl-sm border-2 text-[14px] font-semibold cursor-pointer transition-colors ${form.is_available ? 'border-ink bg-[#DDF5E5] text-[#13723A]' : 'border-ink/15 bg-surface text-muted'}`}
        >
          <span className="flex items-center gap-2">{form.is_available ? <Eye size={16} /> : <EyeOff size={16} />} {form.is_available ? 'В наличии' : 'Нет в наличии — скрыт'}</span>
          <span className={`w-10 h-6 rounded-full border-2 border-ink relative transition-colors ${form.is_available ? 'bg-ink' : 'bg-card'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-[left] ${form.is_available ? 'left-[18px] bg-sun' : 'left-0.5 bg-ink/40'}`} />
          </span>
        </button>
      </div>
    </Drawer>
  );
}

/** A labelled form row; `group` for a control that is not one input (photos). */
function Field({ label, hint, group, children }: { label: string; hint?: string; group?: boolean; children: React.ReactNode }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block">
      <span className="block text-[12px] font-bold text-ink mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </Tag>
  );
}

function OrderDrawer({ order, onClose }: { order: SupplierOrder; onClose: () => void }) {
  const show = useNotificationStore((s) => s.show);
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [status, setStatus] = useState(order.status as string);
  const [history, setHistory] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => fetchSupplierOrderMessages(order.id).then((res) => {
    setMessages(res.messages);
    if (res.status) setStatus(res.status);
    if (res.history) setHistory(res.history);
    setLoading(false);
  }), [order.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    if ((!text.trim() && !images.length) || sending) return;
    setSending(true);
    try {
      const msg = await sendSupplierOrderMessage(order.id, text.trim(), images);
      setMessages((m) => [...m, msg]);
      setText('');
      setImages([]);
    } catch (e) { show((e as Error).message, 'error'); }
    setSending(false);
  };

  const closed = status === 'done' || status === 'cancelled';
  return (
    <Drawer
      title={`Заказ №${order.id}`}
      subtitle={<>{order.buyer} · {formatDate(order.created_at)} · ваши позиции {formatPrice(order.total)}</>}
      onClose={onClose}
      footer={closed ? (
        <div className="px-6 py-3.5 border-t border-ink/[0.07] text-[12px] text-muted flex items-center gap-2"><Eye size={14} className="text-primary" /> Заказ закрыт</div>
      ) : (
        <LeaderComposer
          text={text} setText={setText} images={images} setImages={setImages}
          onSend={send} sending={sending} placeholder="Написать покупателю…" prefix="supplier_order"
        />
      )}
    >
      <div className="px-6 py-4 border-b border-ink/[0.07] space-y-4">
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-bold uppercase tracking-[0.06em] px-2.5 py-1 border ${statusTone(status)}`}>{STATUS_LABEL[status]}</span>
          <span className="ml-auto text-[11.5px] text-muted text-right leading-snug max-w-[240px]">Статусы ведёт площадка, вы отвечаете покупателю о товаре</span>
        </div>
        {/* Before confirmation the track speaks to the buyer («оплатите заказ») */}
        {status === 'new'
          ? <p className="text-[12.5px] text-muted leading-snug">Менеджер подтверждает заказ с покупателем: наличие, сроки, оплата. На вопросы о товаре можете ответить сами — здесь, в чате.</p>
          : <StatusTrack status={status} history={history} />}
        <ItemsList items={order.items} />
      </div>
      <div className="chat-bg flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-ink" /></div>
          : messages.length === 0 ? <div className="mx-auto w-fit text-center text-sm text-muted py-2 px-4 bg-card/90 rounded-full mt-6">Сообщений пока нет</div>
          : messages.map((m) => <Bubble key={m.id} msg={m} mineType="supplier" />)}
      </div>
    </Drawer>
  );
}

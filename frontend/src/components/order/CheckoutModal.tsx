import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageCircle, BadgePercent } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuthStore, useCartStore, useNotificationStore, usePromoStore, priceFor } from '../../store';
import { createStoreOrder } from '../../api/client';
import { formatPrice } from '../../utils/format';

const METHODS = [
  { id: 'phone', label: 'Звонок' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'max', label: 'MAX' },
  { id: 'email', label: 'Почта' },
];

export default function CheckoutModal() {
  const { checkoutOpen, closeCheckout, items, clearCart } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const { code, prices, clear: clearPromo } = usePromoStore();
  const show = useNotificationStore((s) => s.show);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState('telegram');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!checkoutOpen || !user) return;
    setName((v) => v || user.full_name || '');
    setPhone((v) => v || user.phone || '');
  }, [checkoutOpen, user]);

  const total = items.reduce((s, i) => s + priceFor(i.id, i.price, prices) * i.qty, 0);
  const baseTotal = items.reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);

  const submit = async () => {
    setError('');
    if (!name.trim() || !phone.trim()) { setError('Укажите имя и телефон'); return; }
    if (!address.trim()) { setError('Укажите город и адрес доставки'); return; }
    setSending(true);
    const res = await createStoreOrder({
      full_name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      comment: comment.trim(),
      contact_method: method,
      promo_code: code,
      items: items.map((i) => ({ id: i.id, qty: i.qty, variant_comment: i.variant_comment })),
    });
    setSending(false);
    if (res.promo_invalid) clearPromo();
    if (!res.order) { setError(res.error || 'Не удалось оформить заказ'); return; }
    clearCart();
    closeCheckout();
    show(`Заказ #${res.order.id} оформлен — менеджер ответит в чате`);
    navigate(`/orders?order=${res.order.id}`);
  };

  return (
    <Modal open={checkoutOpen} onClose={closeCheckout} maxWidth="max-w-xl">
      <div className="eyebrow mb-2">Оформление</div>
      <h2 className="font-display text-[34px] leading-none text-text mb-5">Ваш заказ</h2>

      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4 mb-5 space-y-2 max-h-[180px] overflow-y-auto">
        {items.map((i) => {
          const unit = priceFor(i.id, i.price, prices);
          return (
            <div key={i.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-muted truncate">{i.name} × {i.qty}</span>
              <span className="text-text font-semibold whitespace-nowrap">{formatPrice(unit * i.qty)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-end justify-between mb-6">
        <div className="text-sm text-muted">
          {code ? (
            <span className="flex items-center gap-1.5 text-primary-light"><BadgePercent size={14} /> Промокод {code}</span>
          ) : 'Без промокода'}
        </div>
        <div className="text-right">
          {baseTotal > total && <div className="text-[12px] text-light line-through">{formatPrice(baseTotal)}</div>}
          <div className="font-display text-[30px] leading-none text-gold-gradient">{formatPrice(total)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <label className="block">
          <span className="text-[12px] text-muted mb-1.5 block">Имя и фамилия</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field" autoComplete="name" />
        </label>
        <label className="block">
          <span className="text-[12px] text-muted mb-1.5 block">Телефон</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field" type="tel" autoComplete="tel" placeholder="+7" />
        </label>
      </div>
      <div className="mt-3">
        <span className="text-[12px] text-muted mb-1.5 block">Как удобнее связаться</span>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-colors cursor-pointer ${method === m.id ? 'bg-primary/15 border-primary/50 text-primary-light' : 'border-white/10 text-muted hover:text-text'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block mt-3">
        <span className="text-[12px] text-muted mb-1.5 block">Город и адрес доставки (или пункт выдачи)</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} className="field" autoComplete="street-address" placeholder="Москва, ул. Тверская, 1, кв. 10" />
      </label>
      <label className="block mt-3">
        <span className="text-[12px] text-muted mb-1.5 block">Комментарий <span className="text-light">(необязательно)</span></span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="field resize-none" placeholder="Удобное время, пожелания" />
      </label>

      {error && <div className="mt-4 text-[13px] text-danger bg-danger/10 border border-danger/25 rounded-xl px-4 py-2.5">{error}</div>}

      <button onClick={submit} disabled={sending || !items.length} className="btn-gold w-full h-12 rounded-full text-[15px] mt-5">
        {sending ? <Loader2 size={18} className="animate-spin" /> : 'Оформить заказ'}
      </button>
      <p className="mt-3 text-[12px] text-light flex items-start gap-2 leading-relaxed">
        <MessageCircle size={14} className="text-primary shrink-0 mt-0.5" />
        Оплачивать сейчас ничего не нужно. Сначала менеджер напишет в чате заказа, подтвердит наличие и пришлёт реквизиты для предоплаты.
      </p>
    </Modal>
  );
}

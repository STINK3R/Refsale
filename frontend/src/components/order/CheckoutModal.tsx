import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuthStore, useCartStore, useNotificationStore, usePromoStore, priceFor } from '../../store';
import { createStoreOrder } from '../../api/client';
import { formatPrice } from '../../utils/format';

const METHODS = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'max', label: 'MAX' },
  { id: 'phone', label: 'Звонок' },
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
    show(`Заказ №${res.order.id} оформлен — менеджер ответит в чате`);
    navigate(`/orders?order=${res.order.id}`);
  };

  return (
    <Modal open={checkoutOpen} onClose={closeCheckout} maxWidth="max-w-[960px]">
      <div className="grid grid-cols-[1.15fr_0.85fr] gap-12 max-md:grid-cols-1 max-md:gap-8">
        <div>
          <div className="label">Оформление</div>
          <h2 className="font-display text-[34px] leading-tight text-text mt-3">Доставка и связь</h2>

          <div className="mt-8 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <Labeled label="Имя и фамилия"><input value={name} onChange={(e) => setName(e.target.value)} className="field" autoComplete="name" /></Labeled>
            <Labeled label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="field" type="tel" autoComplete="tel" placeholder="+7" /></Labeled>
          </div>
          <div className="mt-5">
            <span className="label !text-[10px] block mb-2">Как удобнее связаться</span>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`h-9 px-4 text-[12px] border transition-colors cursor-pointer ${method === m.id ? 'border-text text-text' : 'border-line text-muted hover:text-text'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <Labeled label="Город и адрес или пункт выдачи">
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="field" autoComplete="street-address" placeholder="Москва, ул. Тверская, 1, кв. 10" />
            </Labeled>
          </div>
          <div className="mt-5">
            <Labeled label="Комментарий, необязательно">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="field resize-none" placeholder="Удобное время, пожелания" />
            </Labeled>
          </div>
        </div>

        <div className="md:border-l md:border-line md:pl-12 flex flex-col">
          <div className="label">Ваш заказ</div>
          <div className="mt-5 space-y-4 max-h-[260px] overflow-y-auto pr-1">
            {items.map((i) => {
              const unit = priceFor(i.id, i.price, prices);
              return (
                <div key={i.id} className="flex justify-between gap-4 text-[13px]">
                  <span className="text-muted">{i.name}<span className="text-light"> × {i.qty}</span></span>
                  <span className="text-text whitespace-nowrap tabular-nums">{formatPrice(unit * i.qty)}</span>
                </div>
              );
            })}
          </div>
          <div className="hairline my-6" />
          {baseTotal > total && (
            <div className="flex justify-between text-[13px] text-primary mb-2">
              <span>Промокод {code}</span><span className="tabular-nums">−{formatPrice(baseTotal - total)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="label !text-text">Итого</span>
            <span className="font-display text-[34px] leading-none text-text tabular-nums">{formatPrice(total)}</span>
          </div>

          {error && <div className="mt-5 text-[13px] text-danger">{error}</div>}

          <button onClick={submit} disabled={sending || !items.length} className="btn-primary w-full mt-8">
            {sending ? <Loader2 size={17} className="animate-spin" /> : 'Оформить заказ'}
          </button>
          <p className="mt-4 text-[12px] text-light leading-relaxed">
            Оплачивать сейчас ничего не нужно. Менеджер напишет в чате заказа, подтвердит наличие и пришлёт реквизиты для предоплаты.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label !text-[10px] block mb-2">{label}</span>
      {children}
    </label>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuthStore, useCartStore, useNotificationStore, usePromoStore, priceFor, promoKey, cartKey } from '../../store';
import { createStoreOrder } from '../../api/client';
import { useUiStore } from '../../store/ui';
import { formatPrice } from '../../utils/format';

const METHODS = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'max', label: 'MAX' },
  { id: 'phone', label: 'Звонок' },
  { id: 'email', label: 'Почта' },
];

/** What happens after the button, said plainly: "Оформить" usually means pay. */
const NEXT_STEPS = [
  'Нажмите «Оформить заказ» — платить сейчас не нужно',
  'Менеджер напишет в чате заказа: подтвердит наличие и сроки',
  'Пришлёт реквизиты — оплата только после подтверждения',
];

/**
 * Checkout asks for nothing: the buyer is signed in, the cart is the order.
 * Phone, address and the like are optional and folded away under the button —
 * the manager asks for them in the order chat anyway.
 */
export default function CheckoutModal() {
  const { checkoutOpen, closeCheckout, items, clearCart } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const { code, prices, clear: clearPromo } = usePromoStore();
  const show = useNotificationStore((s) => s.show);
  const showMascot = useUiStore((s) => s.showMascot);
  const navigate = useNavigate();

  const [moreOpen, setMoreOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState('telegram');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!checkoutOpen || !user) return;
    setPhone((v) => v || user.phone || '');
  }, [checkoutOpen, user]);

  const total = items.reduce((s, i) => s + priceFor(promoKey(i.id, i.variant_id), i.price, prices) * i.qty, 0);
  const baseTotal = items.reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);

  const submit = async () => {
    setError('');
    setSending(true);
    const res = await createStoreOrder({
      full_name: user?.full_name || '',
      phone: phone.trim(),
      address: address.trim(),
      comment: comment.trim(),
      contact_method: method,
      promo_code: code,
      items: items.map((i) => ({ id: i.id, qty: i.qty, variant_id: i.variant_id ?? null, variant_comment: i.variant_comment })),
    });
    setSending(false);
    if (res.promo_invalid) clearPromo();
    if (!res.order) { setError(res.error || 'Не удалось оформить заказ'); return; }
    clearCart();
    closeCheckout();
    show(`Заказ №${res.order.id} оформлен — менеджер ответит в чате`);
    showMascot('jump', 'Ура, заказ оформлен! Менеджер уже в чате.');
    navigate(`/orders?order=${res.order.id}`);
  };

  return (
    <Modal open={checkoutOpen} onClose={closeCheckout} maxWidth="max-w-[560px]">
      <div className="label">Оформление</div>
      <h2 className="font-display text-[30px] max-sm:text-[26px] leading-tight text-ink mt-3 pr-12">Ваш заказ</h2>

      <div className="mt-6 space-y-3 max-h-[220px] overflow-y-auto pr-1">
        {items.map((i) => {
          const unit = priceFor(promoKey(i.id, i.variant_id), i.price, prices);
          return (
            <div key={cartKey(i)} className="flex justify-between gap-4 text-[14px]">
              <span className="text-text">{i.name}{i.variant_label ? ` — ${i.variant_label}` : ''}<span className="text-light"> × {i.qty}</span></span>
              <span className="text-text font-semibold whitespace-nowrap tabular-nums">{formatPrice(unit * i.qty)}</span>
            </div>
          );
        })}
      </div>
      <div className="hairline my-5" />
      {baseTotal > total && (
        <div className="flex justify-between text-[13px] font-semibold text-primary-dark mb-2">
          <span>Промокод {code}</span><span className="tabular-nums">−{formatPrice(baseTotal - total)}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <span className="label !text-text">Итого</span>
        <span className="font-display text-[32px] leading-none text-ink tabular-nums">{formatPrice(total)}</span>
      </div>

      {/* The answer to "will it charge me?" before the button, not under it */}
      <div className="mt-6 rounded-[20px] border-2 border-ink bg-accent-strong p-5 max-sm:p-4">
        <div className="text-[16px] font-extrabold text-ink">Сейчас платить не нужно</div>
        <ol className="mt-3 space-y-2">
          {NEXT_STEPS.map((t, n) => (
            <li key={t} className="flex gap-3 text-[14px] font-semibold text-ink leading-snug">
              <span className="w-6 h-6 shrink-0 rounded-ctl-xs bg-ink text-sun text-[12px] font-extrabold flex items-center justify-center">{n + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
      </div>

      {error && <div className="mt-5 text-[13px] font-semibold text-danger">{error}</div>}

      <button onClick={submit} disabled={sending || !items.length} className="btn-primary w-full mt-6">
        {sending ? <Loader2 size={17} className="animate-spin" /> : 'Оформить заказ'}
      </button>

      {/* Optional, after the button: the manager asks for these in the chat */}
      <div className="mt-6 border-t-2 border-ink/10 pt-5">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <span>
            <span className="block text-[14px] font-bold text-ink">По желанию: телефон, адрес, комментарий</span>
            <span className="block text-[12.5px] text-muted mt-0.5">Можно не заполнять — менеджер спросит в чате</span>
          </span>
          <ChevronDown size={18} strokeWidth={2.2} className={`shrink-0 transition-transform duration-300 ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
        {moreOpen && (
          <div className="mt-5 space-y-5">
            <Labeled label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="field" type="tel" autoComplete="tel" placeholder="+7" /></Labeled>
            <div>
              <span className="label !text-[10px] block mb-2">Как удобнее связаться</span>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`h-9 px-4 rounded-ctl-sm text-[12.5px] font-semibold border-2 transition-colors cursor-pointer ${method === m.id ? 'border-ink bg-accent-strong text-ink' : 'border-line bg-card text-muted hover:text-ink'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <Labeled label="Город и адрес или пункт выдачи">
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="field" autoComplete="street-address" placeholder="Москва, ул. Тверская, 1, кв. 10" />
            </Labeled>
            <Labeled label="Комментарий">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="field resize-none" placeholder="Удобное время, пожелания" />
            </Labeled>
          </div>
        )}
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

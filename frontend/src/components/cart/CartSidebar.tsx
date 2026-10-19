import { AnimatePresence, motion } from 'framer-motion';
import { X, Minus, Plus } from 'lucide-react';
import { useCartStore, useAuthStore, usePromoStore, priceFor, promoKey, cartKey, runAfterAuth } from '../../store';
import { formatPrice } from '../../utils/format';
import useScrollLock from '../../hooks/useScrollLock';
import PromoForm from '../promo/PromoForm';

const EASE = [0.22, 1, 0.36, 1] as const;

export default function CartSidebar() {
  const { items, sidebarOpen, closeSidebar, changeQty, removeItem, openCheckout } = useCartStore();
  const { user, openAuth } = useAuthStore();
  const prices = usePromoStore((s) => s.prices);
  useScrollLock(sidebarOpen);

  const baseTotal = items.reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);
  const total = items.reduce((s, i) => s + priceFor(promoKey(i.id, i.variant_id), i.price, prices) * i.qty, 0);
  const saved = baseTotal - total;
  const count = items.reduce((s, i) => s + i.qty, 0);

  const checkout = () => {
    if (!items.length) return;
    if (!user) {
      closeSidebar();
      runAfterAuth(openCheckout);
      openAuth('register', 'Создайте аккаунт, чтобы оформить заказ: в нём будет чат с менеджером и статусы заказа.');
      return;
    }
    openCheckout();
  };

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="fixed inset-0 z-[2000] bg-black/70" onClick={closeSidebar} />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.55, ease: EASE }}
            className="fixed top-0 right-0 bottom-0 z-[2100] w-[460px] max-w-full bg-bg border-l border-line flex flex-col"
          >
            <div className="flex items-center justify-between px-8 max-sm:px-5 h-[68px] border-b border-line shrink-0">
              <span className="label !text-text">Корзина{count ? ` · ${count}` : ''}</span>
              <button onClick={closeSidebar} className="text-muted hover:text-text cursor-pointer" aria-label="Закрыть корзину">
                <X size={20} strokeWidth={1.4} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 max-sm:px-5">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <div className="font-display text-[30px] text-text">Корзина пуста</div>
                  <p className="text-[14px] text-muted mt-3 mb-8 max-w-[260px]">Выберите аромат или средство ухода в каталоге</p>
                  <button onClick={() => { closeSidebar(); document.querySelector('#catalog')?.scrollIntoView({ behavior: 'smooth' }); }} className="btn-outline">
                    Перейти в каталог
                  </button>
                </div>
              ) : (
                items.map((item) => {
                  const key = cartKey(item);
                  const unit = priceFor(promoKey(item.id, item.variant_id), item.price, prices);
                  const discounted = unit < (Number(item.price) || 0);
                  return (
                    <div key={key} className="flex gap-5 py-6 border-b border-line last:border-b-0">
                      <div className="w-[88px] h-[110px] shrink-0 bg-[radial-gradient(ellipse_at_50%_42%,#1C1C1C_0%,#121212_70%)] flex items-center justify-center">
                        {item.image_url
                          ? <img src={item.image_url} alt="" className="w-full h-full object-contain p-2" />
                          : <span className="font-display text-[36px] text-white/[0.07]">R</span>}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="text-[14px] leading-snug text-text line-clamp-2">{item.name}</div>
                        {item.variant_label && <div className="text-[12px] text-muted mt-1 truncate">{item.variant_label}</div>}
                        {item.variant_comment && <div className="text-[12px] text-muted mt-1 truncate">Вариант: {item.variant_comment}</div>}
                        <div className="flex items-baseline gap-2.5 mt-2">
                          <span className="text-[14px] text-text tabular-nums">{formatPrice(unit)}</span>
                          {discounted && <span className="text-[12px] text-light line-through tabular-nums">{formatPrice(item.price)}</span>}
                        </div>
                        <div className="mt-auto pt-3 flex items-center justify-between">
                          <div className="flex items-center border border-line">
                            <button onClick={() => changeQty(key, -1)} className="w-8 h-8 flex items-center justify-center text-muted hover:text-text cursor-pointer" aria-label="Меньше"><Minus size={13} strokeWidth={1.5} /></button>
                            <span className="w-7 text-center text-[13px] tabular-nums">{item.qty}</span>
                            <button onClick={() => changeQty(key, 1)} className="w-8 h-8 flex items-center justify-center text-muted hover:text-text cursor-pointer" aria-label="Больше"><Plus size={13} strokeWidth={1.5} /></button>
                          </div>
                          <button onClick={() => removeItem(key)} className="text-[11px] uppercase tracking-[0.14em] text-muted hover:text-text cursor-pointer">Удалить</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {items.length > 0 && (
              <div className="px-8 max-sm:px-5 py-6 border-t border-line space-y-5 shrink-0">
                <PromoForm variant="box" />
                <div className="space-y-2 text-[13px]">
                  {saved > 0 && (
                    <>
                      <div className="flex justify-between text-muted"><span>Без промокода</span><span className="tabular-nums line-through">{formatPrice(baseTotal)}</span></div>
                      <div className="flex justify-between text-primary"><span>Скидка по промокоду</span><span className="tabular-nums">−{formatPrice(saved)}</span></div>
                    </>
                  )}
                  <div className="flex items-baseline justify-between pt-2">
                    <span className="label !text-text">Итого</span>
                    <span className="font-display text-[30px] leading-none text-text tabular-nums">{formatPrice(total)}</span>
                  </div>
                </div>
                <button onClick={checkout} className="btn-primary w-full">Оформить заказ</button>
                <p className="text-[12px] text-light text-center">Оплата после подтверждения менеджером в чате заказа</p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
